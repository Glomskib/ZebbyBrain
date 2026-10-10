import { precomputeInsightsForActiveUsers } from "./lib/cache";
import { processReminders } from "./lib/reminders";
import { processCircleAlerts } from "./lib/circle-alerts";
import { processWeekActiveRewards } from "./lib/week-active-rewards";
import { processHerdAlerts } from "./lib/herd-alerts";
import { purgeDeletedAccounts } from "./routes/account";
import { purgeExpiredVisitAudio } from "./lib/visitRetention";
import { schedBoot, schedInfo, schedError } from "./lib/schedLog";

/**
 * Enhanced cron scheduler for insights precomputation and reminder processing
 * - Insights: Runs every day at 2:00 AM to prepare cache for the day ahead
 * - Reminders: Runs every 15 minutes to check for due reminders
 */
export function setupCronJobs() {
  schedBoot({ evt: "cron_scheduler_started" });

  // Calculate time until next 2 AM
  function getTimeUntilNext2AM(): number {
    const now = new Date();
    const next2AM = new Date();
    
    // Set to 2 AM today
    next2AM.setHours(2, 0, 0, 0);
    
    // If 2 AM has already passed today, set to 2 AM tomorrow
    if (now >= next2AM) {
      next2AM.setDate(next2AM.getDate() + 1);
    }
    
    return next2AM.getTime() - now.getTime();
  }

  // Schedule the first run
  function scheduleNextRun() {
    const msUntilNext2AM = getTimeUntilNext2AM();
    const hoursUntil = Math.round(msUntilNext2AM / (1000 * 60 * 60) * 10) / 10;
    
    schedBoot({
      evt: "cron_next_run_scheduled",
      hoursUntil,
      nextRunAt: new Date(Date.now() + msUntilNext2AM).toISOString(),
    });

    setTimeout(async () => {
      try {
        schedInfo({ evt: "cron_job_triggered", type: "daily_2am" });

        // Run insights precomputation
        await precomputeInsightsForActiveUsers();

        // Run week-active rewards processing
        await processWeekActiveRewards();

        // Run account purge (7-day deleted accounts)
        await purgeDeletedAccounts();

        schedInfo({ evt: "cron_job_completed", type: "daily_2am" });
      } catch (error) {
        schedError({
          evt: "cron_job_error",
          type: "daily_2am",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
      
      // Schedule the next run (24 hours from now)
      scheduleNextRun();
    }, msUntilNext2AM);
  }

  // Start the insights scheduler
  scheduleNextRun();

  // Set up reminder processing (every 15 minutes)
  function scheduleReminderProcessing() {
    const reminderInterval = 15 * 60 * 1000; // 15 minutes in milliseconds

    schedBoot({ evt: "reminder_scheduler_started", intervalMinutes: 15 });

    const processRemindersNow = async () => {
      try {
        schedInfo({ evt: "reminder_processing_triggered" });
        await processReminders();
        schedInfo({ evt: "reminder_processing_completed" });
      } catch (error) {
        schedError({
          evt: "reminder_processing_error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    };

    // Run immediately after 1 minute to check for any immediate reminders
    setTimeout(processRemindersNow, 60_000);

    // Then run every 15 minutes
    setInterval(processRemindersNow, reminderInterval);
  }

  // Set up circle alert processing (every 15 minutes)
  function scheduleCircleAlertProcessing() {
    const alertInterval = 15 * 60 * 1000; // 15 minutes in milliseconds

    schedBoot({ evt: "circle_alert_scheduler_started", intervalMinutes: 15 });

    const processCircleAlertsNow = async () => {
      try {
        await processCircleAlerts();
      } catch (error) {
        schedError({
          evt: "circle_alert_processing_error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    };

    // Run immediately after 2 minutes
    setTimeout(processCircleAlertsNow, 120_000);

    // Then run every 15 minutes
    setInterval(processCircleAlertsNow, alertInterval);
  }

  // Visit Recorder audio retention (hourly): deletes audio once the transcript
  // is approved, after 30 days at most, or 24h after an upload that never came.
  function scheduleVisitAudioRetention() {
    const interval = 60 * 60 * 1000;
    schedBoot({ evt: "visit_audio_retention_scheduler_started", intervalMinutes: 60 });
    const run = async () => {
      try {
        const removed = await purgeExpiredVisitAudio();
        if (removed > 0) schedInfo({ evt: "visit_audio_purged", count: removed });
      } catch (error) {
        schedError({
          evt: "visit_audio_retention_error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    };
    setTimeout(run, 3 * 60_000);
    setInterval(run, interval);
  }

  // Start the reminder processor
  scheduleReminderProcessing();

  // Start Visit Recorder audio retention
  scheduleVisitAudioRetention();

  // Start the circle alert processor
  scheduleCircleAlertProcessing();

  // Set up herd alert processing (every 1 minute) - Wave 3+
  function scheduleHerdAlertProcessing() {
    const alertInterval = 60 * 1000; // 1 minute in milliseconds

    schedBoot({ evt: "herd_alert_scheduler_started", intervalMinutes: 1 });

    const processHerdAlertsNow = async () => {
      try {
        await processHerdAlerts();
      } catch (error) {
        schedError({
          evt: "herd_alert_processing_error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    };

    // Run immediately after 30 seconds
    setTimeout(processHerdAlertsNow, 30_000);

    // Then run every minute
    setInterval(processHerdAlertsNow, alertInterval);
  }

  // Start the herd alert processor if feature is enabled
  if (process.env.FF_HERD === "true") {
    scheduleHerdAlertProcessing();
  }

  // In development, also run once immediately for testing (but don't reschedule)
  if (process.env.NODE_ENV === "development") {
    setTimeout(async () => {
      schedInfo({ evt: "dev_insights_precompute_start" });
      try {
        await precomputeInsightsForActiveUsers();
        schedInfo({ evt: "dev_insights_precompute_complete" });
      } catch (error) {
        schedError({
          evt: "dev_insights_precompute_error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
      // Note: Don't call scheduleNextRun() here to avoid duplicate timers
    }, 30_000); // 30 seconds after server start
  }
}

/**
 * Manual trigger for insights precomputation (for admin/testing)
 */
export async function triggerInsightsPrecompute(): Promise<{ success: boolean; message: string }> {
  try {
    console.info(JSON.stringify({
      evt: "manual_insights_precompute_triggered",
      timestamp: new Date().toISOString()
    }));

    await precomputeInsightsForActiveUsers();
    
    return {
      success: true,
      message: "Insights precomputation completed successfully"
    };
  } catch (error) {
    console.error(JSON.stringify({
      evt: "manual_insights_precompute_error",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }));
    
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}