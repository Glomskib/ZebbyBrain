import { db } from "../db";
import {
  circles,
  circleMembers,
  circleScopes,
  circleAlertRules,
  circleAlertLogs,
  circlePendingAlerts,
  users,
  symptomLogs,
  symptomEntries,
  vitalsLogs,
  sleepLogs,
} from "@shared/schema";
import { eq, and, desc, gte, lte, sql, isNull } from "drizzle-orm";
import { subMinutes, subDays, startOfDay } from "date-fns";
import nodemailer from "nodemailer";
import crypto from "crypto";

/**
 * Process circle automated alerts
 * - Evaluates alert rules for circles with enabled notifications
 * - Respects quiet hours and cooldowns
 * - Sends automated alerts to active members after cancel window
 * - Runs every 15 minutes via cron
 */
export async function processCircleAlerts(): Promise<void> {
  console.info(JSON.stringify({
    evt: "circle_alerts_processing_start",
    timestamp: new Date().toISOString()
  }));

  try {
    // Send pending alerts whose cancel window has passed
    await sendPendingAlerts();

    // Evaluate alert rules and create new pending alerts
    await evaluateAlertRules();

    console.info(JSON.stringify({
      evt: "circle_alerts_processing_complete",
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    console.error(JSON.stringify({
      evt: "circle_alerts_processing_error",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }));
  }
}

/**
 * Send pending alerts that have passed their cancel window and haven't been cancelled
 */
async function sendPendingAlerts(): Promise<void> {
  const now = new Date();
  
  // Get pending alerts ready to send with rule settings
  const readyAlerts = await db
    .select({
      alertId: circlePendingAlerts.id,
      circleId: circlePendingAlerts.circleId,
      ruleId: circlePendingAlerts.ruleId,
      triggerReason: circlePendingAlerts.triggerReason,
      circleName: circles.name,
      ownerId: circles.ownerId,
      ownerFirstName: users.firstName,
      ownerLastName: users.lastName,
      quietStart: circleAlertRules.quietStart,
      quietEnd: circleAlertRules.quietEnd,
      channelEmail: circleAlertRules.channelEmail,
    })
    .from(circlePendingAlerts)
    .innerJoin(circles, eq(circlePendingAlerts.circleId, circles.id))
    .innerJoin(users, eq(circles.ownerId, users.id))
    .leftJoin(circleAlertRules, eq(circlePendingAlerts.ruleId, circleAlertRules.id))
    .where(
      and(
        lte(circlePendingAlerts.scheduledFor, now),
        isNull(circlePendingAlerts.canceledAt)
      )
    );

  if (readyAlerts.length === 0) {
    return;
  }

  console.info(JSON.stringify({
    evt: "circle_alerts_ready_to_send",
    count: readyAlerts.length,
    timestamp: new Date().toISOString()
  }));

  for (const alert of readyAlerts) {
    try {
      // Check if we're in quiet hours - if so, reschedule for later
      if (isInQuietHours(alert.quietStart, alert.quietEnd)) {
        // Reschedule for 1 hour later
        const newScheduledFor = new Date(Date.now() + 60 * 60 * 1000);
        await db
          .update(circlePendingAlerts)
          .set({ scheduledFor: newScheduledFor })
          .where(eq(circlePendingAlerts.id, alert.alertId));

        console.info(JSON.stringify({
          evt: "circle_alert_rescheduled_quiet_hours",
          circleId: alert.circleId,
          alertId: alert.alertId,
          newScheduledFor,
          timestamp: new Date().toISOString()
        }));
        continue;
      }

      const ownerName = `${alert.ownerFirstName} ${alert.ownerLastName}`.trim();
      
      // Send alert to all active members (respecting channel preferences)
      await sendAlertToMembers(
        alert.circleId,
        alert.ruleId || undefined,
        ownerName,
        alert.triggerReason,
        alert.channelEmail ?? true
      );

      // Delete the pending alert after sending
      await db
        .delete(circlePendingAlerts)
        .where(eq(circlePendingAlerts.id, alert.alertId));

      console.info(JSON.stringify({
        evt: "circle_alert_sent",
        circleId: alert.circleId,
        alertId: alert.alertId,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error(JSON.stringify({
        evt: "circle_alert_send_error",
        alertId: alert.alertId,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      }));
    }
  }
}

/**
 * Evaluate alert rules and create pending alerts for triggered conditions
 */
async function evaluateAlertRules(): Promise<void> {
  // Get all active alert rules
  const activeRules = await db
    .select({
      ruleId: circleAlertRules.id,
      circleId: circleAlertRules.circleId,
      ownerId: circles.ownerId,
      quietStart: circleAlertRules.quietStart,
      quietEnd: circleAlertRules.quietEnd,
      cooldownMin: circleAlertRules.cooldownMin,
      flareThreshold: circleAlertRules.flareThreshold,
      hrDeltaBpm: circleAlertRules.hrDeltaBpm,
      lowSleepHours: circleAlertRules.lowSleepHours,
      channelEmail: circleAlertRules.channelEmail,
      ownerFirstName: users.firstName,
      ownerLastName: users.lastName,
    })
    .from(circleAlertRules)
    .innerJoin(circles, eq(circleAlertRules.circleId, circles.id))
    .innerJoin(users, eq(circles.ownerId, users.id))
    .where(eq(circleAlertRules.active, true));

  if (activeRules.length === 0) {
    console.info(JSON.stringify({
      evt: "circle_alerts_no_active_rules",
      timestamp: new Date().toISOString()
    }));
    return;
  }

  console.info(JSON.stringify({
    evt: "circle_alerts_rules_found",
    count: activeRules.length,
    timestamp: new Date().toISOString()
  }));

  for (const rule of activeRules) {
    try {
      // Check if we're in quiet hours
      if (isInQuietHours(rule.quietStart, rule.quietEnd)) {
        continue;
      }

      // Check cooldown
      const cooldownDate = subMinutes(new Date(), rule.cooldownMin);
      const [recentAlert] = await db
        .select()
        .from(circleAlertLogs)
        .where(
          and(
            eq(circleAlertLogs.circleId, rule.circleId),
            gte(circleAlertLogs.sentAt, cooldownDate)
          )
        )
        .orderBy(desc(circleAlertLogs.sentAt))
        .limit(1);

      if (recentAlert) {
        continue; // Still in cooldown
      }

      // Check if there's already a pending alert for this circle
      const [existingPending] = await db
        .select()
        .from(circlePendingAlerts)
        .where(
          and(
            eq(circlePendingAlerts.circleId, rule.circleId),
            isNull(circlePendingAlerts.canceledAt)
          )
        )
        .limit(1);

      if (existingPending) {
        continue; // Already have a pending alert
      }

      // Evaluate trigger conditions
      const triggerReason = await evaluateTriggerConditions(
        rule.ownerId,
        rule.flareThreshold,
        rule.hrDeltaBpm,
        rule.lowSleepHours
      );

      if (triggerReason) {
        // Create pending alert with 15-minute cancel window
        const scheduledFor = new Date(Date.now() + 15 * 60 * 1000);
        
        await db.insert(circlePendingAlerts).values({
          circleId: rule.circleId,
          ruleId: rule.ruleId,
          triggerReason,
          scheduledFor,
        });

        console.info(JSON.stringify({
          evt: "circle_alert_pending_created",
          circleId: rule.circleId,
          triggerReason,
          scheduledFor,
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error) {
      console.error(JSON.stringify({
        evt: "circle_alert_evaluation_error",
        ruleId: rule.ruleId,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      }));
    }
  }
}

/**
 * Evaluate trigger conditions and return reason if triggered
 */
async function evaluateTriggerConditions(
  ownerId: string,
  flareThreshold: number | null,
  hrDeltaBpm: number | null,
  lowSleepHours: string | null
): Promise<string | null> {
  const last24Hours = subDays(new Date(), 1);

  // Check flare threshold (pain intensity >= threshold)
  if (flareThreshold !== null) {
    const [highPainEntry] = await db
      .select({
        intensity: symptomEntries.intensity,
        symptomName: symptomEntries.symptomName,
      })
      .from(symptomEntries)
      .innerJoin(symptomLogs, eq(symptomEntries.symptomLogId, symptomLogs.id))
      .where(
        and(
          eq(symptomLogs.userId, ownerId),
          gte(symptomEntries.intensity, flareThreshold),
          gte(symptomLogs.timestamp, last24Hours)
        )
      )
      .orderBy(desc(symptomLogs.timestamp))
      .limit(1);

    if (highPainEntry) {
      return `High symptom intensity detected (${highPainEntry.symptomName}: ${highPainEntry.intensity}/10)`;
    }
  }

  // Check heart rate delta (POTS indicator)
  if (hrDeltaBpm !== null) {
    // Get recent vitals to check for significant HR changes
    const recentVitals = await db
      .select({
        value: vitalsLogs.value,
        type: vitalsLogs.type,
        timestamp: vitalsLogs.timestamp,
      })
      .from(vitalsLogs)
      .where(
        and(
          eq(vitalsLogs.userId, ownerId),
          eq(vitalsLogs.type, "heart_rate"),
          gte(vitalsLogs.timestamp, last24Hours)
        )
      )
      .orderBy(desc(vitalsLogs.timestamp))
      .limit(10);

    if (recentVitals.length >= 2) {
      const values = recentVitals.map(v => parseFloat(v.value));
      const max = Math.max(...values);
      const min = Math.min(...values);
      const delta = max - min;

      if (delta >= hrDeltaBpm) {
        return `Significant heart rate variation detected (${Math.round(delta)} bpm change)`;
      }
    }
  }

  // Check low sleep hours
  if (lowSleepHours !== null) {
    const sleepThreshold = parseFloat(lowSleepHours);
    const [lastSleep] = await db
      .select({
        totalMinutes: sleepLogs.totalMinutes,
        bedtime: sleepLogs.bedtime,
      })
      .from(sleepLogs)
      .where(
        and(
          eq(sleepLogs.userId, ownerId),
          gte(sleepLogs.bedtime, last24Hours)
        )
      )
      .orderBy(desc(sleepLogs.bedtime))
      .limit(1);

    if (lastSleep && lastSleep.totalMinutes) {
      const sleepHours = lastSleep.totalMinutes / 60;
      if (sleepHours < sleepThreshold) {
        return `Low sleep detected (${sleepHours.toFixed(1)} hours)`;
      }
    }
  }

  return null;
}

/**
 * Check if current time is within quiet hours
 */
function isInQuietHours(quietStart: string | null, quietEnd: string | null): boolean {
  if (!quietStart || !quietEnd) {
    return false; // No quiet hours configured
  }

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;

  const [startHour, startMin] = quietStart.split(':').map(Number);
  const [endHour, endMin] = quietEnd.split(':').map(Number);
  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;

  if (startTime < endTime) {
    // Normal range (e.g., 22:00 to 23:00)
    return currentTime >= startTime && currentTime < endTime;
  } else {
    // Wraps midnight (e.g., 22:00 to 07:00)
    return currentTime >= startTime || currentTime < endTime;
  }
}

/**
 * Send alert to all active members of a circle
 */
async function sendAlertToMembers(
  circleId: string,
  ruleId: string | undefined,
  ownerName: string,
  triggerReason: string,
  channelEmail: boolean = true
): Promise<void> {
  // Get active members
  const members = await db
    .select({
      id: circleMembers.id,
      email: circleMembers.email,
      pseudonym: circleMembers.pseudonym,
    })
    .from(circleMembers)
    .where(
      and(
        eq(circleMembers.circleId, circleId),
        eq(circleMembers.status, "active")
      )
    );

  if (members.length === 0) {
    return;
  }

  const transporter = channelEmail ? getEmailTransporter() : null;
  const summary = "Health monitoring alert";
  const payloadHash = crypto.createHash('sha256')
    .update(`${circleId}-${triggerReason}-${new Date().toISOString()}`)
    .digest('hex');

  for (const member of members) {
    try {
      // Log the alert
      await db.insert(circleAlertLogs).values({
        circleId,
        ruleId: ruleId || null,
        toMemberId: member.id,
        channel: channelEmail ? "email" : "inapp",
        summary,
        payloadHash,
      });

      // Send email only if channel is enabled and configured
      if (channelEmail && transporter && member.email) {
        const emailSubject = `Health update from ${ownerName}`;
        const emailBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #6366f1;">Automated health alert</h2>
            <p><strong>${ownerName}</strong> has experienced a significant health change.</p>
            <p style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
              ${triggerReason}
            </p>
            <p>This notification was sent because specific health thresholds were reached. The person you're supporting may need your attention.</p>
            <p style="margin-top: 30px;">
              <a href="${process.env.VITE_APP_URL || 'https://zebbysworld.com'}/circle/member-view" 
                 style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                View Their Health Updates
              </a>
            </p>
            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              You're receiving this automated alert because you're a member of ${ownerName}'s Personal Circle on Zebby's World.
            </p>
          </div>
        `;

        await transporter.sendMail({
          from: process.env.SMTP_FROM_EMAIL || "noreply@zebbysworld.com",
          to: member.email,
          subject: emailSubject,
          html: emailBody,
        });

        console.info(JSON.stringify({
          evt: "circle_automated_alert_sent",
          circleId,
          memberId: member.id,
          memberEmail: member.email,
          timestamp: new Date().toISOString()
        }));
      } else if (!channelEmail) {
        console.info(JSON.stringify({
          evt: "circle_automated_alert_logged_no_email",
          circleId,
          memberId: member.id,
          reason: "Email channel disabled",
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error) {
      console.error(JSON.stringify({
        evt: "circle_alert_send_error",
        circleId,
        memberId: member.id,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      }));
    }
  }
}

/**
 * Get email transporter
 */
function getEmailTransporter(): nodemailer.Transporter | null {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}
