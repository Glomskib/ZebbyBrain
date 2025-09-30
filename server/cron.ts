import { precomputeInsightsForActiveUsers } from "./lib/cache";
import { processReminders } from "./lib/reminders";
import { processCircleAlerts } from "./lib/circle-alerts";
import { processWeekActiveRewards } from "./lib/week-active-rewards";

/**
 * Enhanced cron scheduler for insights precomputation and reminder processing
 * - Insights: Runs every day at 2:00 AM to prepare cache for the day ahead
 * - Reminders: Runs every 15 minutes to check for due reminders
 */
export function setupCronJobs() {
  console.info(JSON.stringify({
    evt: "cron_scheduler_started",
    timestamp: new Date().toISOString()
  }));

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
    
    console.info(JSON.stringify({
      evt: "cron_next_run_scheduled",
      hoursUntil,
      nextRunAt: new Date(Date.now() + msUntilNext2AM).toISOString(),
      timestamp: new Date().toISOString()
    }));

    setTimeout(async () => {
      try {
        console.info(JSON.stringify({
          evt: "cron_job_triggered",
          type: "insights_precompute",
          timestamp: new Date().toISOString()
        }));

        await precomputeInsightsForActiveUsers();
        
        console.info(JSON.stringify({
          evt: "cron_job_completed",
          type: "insights_precompute",
          timestamp: new Date().toISOString()
        }));
      } catch (error) {
        console.error(JSON.stringify({
          evt: "cron_job_error",
          type: "insights_precompute",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString()
        }));
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

    console.info(JSON.stringify({
      evt: "reminder_scheduler_started",
      intervalMinutes: 15,
      timestamp: new Date().toISOString()
    }));

    const processRemindersNow = async () => {
      try {
        console.info(JSON.stringify({
          evt: "reminder_processing_triggered",
          timestamp: new Date().toISOString()
        }));

        await processReminders();
        
        console.info(JSON.stringify({
          evt: "reminder_processing_completed",
          timestamp: new Date().toISOString()
        }));
      } catch (error) {
        console.error(JSON.stringify({
          evt: "reminder_processing_error",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString()
        }));
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

    console.info(JSON.stringify({
      evt: "circle_alert_scheduler_started",
      intervalMinutes: 15,
      timestamp: new Date().toISOString()
    }));

    const processCircleAlertsNow = async () => {
      try {
        await processCircleAlerts();
      } catch (error) {
        console.error(JSON.stringify({
          evt: "circle_alert_processing_error",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString()
        }));
      }
    };

    // Run immediately after 2 minutes
    setTimeout(processCircleAlertsNow, 120_000);

    // Then run every 15 minutes
    setInterval(processCircleAlertsNow, alertInterval);
  }

  // Start the reminder processor
  scheduleReminderProcessing();

  // Start the circle alert processor
  scheduleCircleAlertProcessing();

  // In development, also run once immediately for testing (but don't reschedule)
  if (process.env.NODE_ENV === "development") {
    setTimeout(async () => {
      console.info(JSON.stringify({
        evt: "dev_insights_precompute_start",
        timestamp: new Date().toISOString()
      }));
      
      try {
        await precomputeInsightsForActiveUsers();
        console.info(JSON.stringify({
          evt: "dev_insights_precompute_complete",
          timestamp: new Date().toISOString()
        }));
      } catch (error) {
        console.error(JSON.stringify({
          evt: "dev_insights_precompute_error",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString()
        }));
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