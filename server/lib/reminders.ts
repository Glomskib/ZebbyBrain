import nodemailer from "nodemailer";
import { storage } from "../storage";
import { users } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { db } from "../db";

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

/**
 * Process due reminders and send notifications
 * This function is called by the cron scheduler every 15 minutes
 */
export async function processReminders(): Promise<void> {
  console.info(JSON.stringify({
    evt: "reminder_processing_start",
    timestamp: new Date().toISOString()
  }));

  try {
    // Get all enabled reminders that are due for processing
    const now = new Date();
    const dueReminders = await storage.getScheduledReminders(now);
    
    if (dueReminders.length === 0) {
      console.info(JSON.stringify({
        evt: "reminder_processing_no_due_reminders",
        timestamp: new Date().toISOString()
      }));
      return;
    }

    console.info(JSON.stringify({
      evt: "reminder_processing_found_due_reminders",
      count: dueReminders.length,
      timestamp: new Date().toISOString()
    }));

    let processedCount = 0;
    let errorCount = 0;

    // Process each due reminder
    for (const reminder of dueReminders) {
      try {
        await processIndividualReminder(reminder);
        processedCount++;
      } catch (error) {
        errorCount++;
        console.error(JSON.stringify({
          evt: "reminder_processing_individual_error",
          reminderId: reminder.id,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString()
        }));
      }
    }

    console.info(JSON.stringify({
      evt: "reminder_processing_complete",
      processedCount,
      errorCount,
      totalReminders: dueReminders.length,
      timestamp: new Date().toISOString()
    }));

  } catch (error) {
    console.error(JSON.stringify({
      evt: "reminder_processing_fatal_error",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }));
    throw error;
  }
}

/**
 * Process an individual reminder by sending notifications and updating state
 */
async function processIndividualReminder(reminder: any): Promise<void> {
  // Skip if reminder is snoozed and snooze time hasn't passed
  if (reminder.isSnoozing && reminder.snoozeUntil && new Date(reminder.snoozeUntil) > new Date()) {
    console.info(JSON.stringify({
      evt: "reminder_skipped_snoozing",
      reminderId: reminder.id,
      snoozeUntil: reminder.snoozeUntil,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Get user information for the reminder
  const [user] = await db.select().from(users).where(eq(users.id, reminder.userId));
  
  if (!user || !user.email) {
    console.error(JSON.stringify({
      evt: "reminder_processing_no_user_email",
      reminderId: reminder.id,
      userId: reminder.userId,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Send notifications based on channels
  const notificationResults = {
    email: false,
    inApp: false
  };

  // Send email notification if enabled
  if (reminder.channelEmail) {
    try {
      await sendReminderEmail(user, reminder);
      notificationResults.email = true;
    } catch (error) {
      console.error(JSON.stringify({
        evt: "reminder_email_send_failed",
        reminderId: reminder.id,
        userId: reminder.userId,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      }));
    }
  }

  // In-app notifications would be handled by the frontend polling or websockets
  // For now, we'll just mark it as sent
  if (reminder.channelInApp) {
    notificationResults.inApp = true;
  }

  // Update reminder state: clear snooze, update last sent time, calculate next scheduled time
  const now = new Date();
  const nextScheduledAt = calculateNextScheduledTime(reminder, now);

  // Clear snooze state if needed
  if (reminder.isSnoozing) {
    await storage.updateReminder(reminder.id, reminder.userId, {
      isSnoozing: false,
      snoozeUntil: null,
    });
  }

  // Update system-managed scheduling timestamps
  await storage.updateReminderNextScheduled(reminder.id, nextScheduledAt, now);

  console.info(JSON.stringify({
    evt: "reminder_processed_successfully",
    reminderId: reminder.id,
    userId: reminder.userId,
    notificationResults,
    nextScheduledAt: nextScheduledAt.toISOString(),
    timestamp: new Date().toISOString()
  }));
}

/**
 * Send email notification for a reminder
 */
async function sendReminderEmail(user: any, reminder: any): Promise<void> {
  // Create email transporter (using environment variables for configuration)
  const transporter = getEmailTransporter();
  
  if (!transporter) {
    console.warn(JSON.stringify({
      evt: "reminder_email_transporter_not_configured",
      reminderId: reminder.id,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  const emailSubject = getReminderEmailSubject(reminder);
  const emailBody = getReminderEmailBody(user, reminder);

  await transporter.sendMail({
    from: process.env.SMTP_FROM_EMAIL || "noreply@zebbysworld.com",
    to: user.email,
    subject: emailSubject,
    html: emailBody,
  });

  console.info(JSON.stringify({
    evt: "reminder_email_sent",
    reminderId: reminder.id,
    userId: reminder.userId,
    userEmail: user.email,
    timestamp: new Date().toISOString()
  }));
}

/**
 * Get email transporter based on environment configuration
 */
function getEmailTransporter(): nodemailer.Transporter | null {
  // Check if email configuration is available
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  const config: EmailConfig = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  };

  return nodemailer.createTransport(config);
}

/**
 * Generate email subject for reminder
 */
function getReminderEmailSubject(reminder: any): string {
  const typeEmojis = {
    medication: "💊",
    hydration: "💧", 
    posture: "🧘",
    custom: "⏰"
  };

  const emoji = typeEmojis[reminder.type as keyof typeof typeEmojis] || "⏰";
  
  return `${emoji} Zebby's Reminder: ${reminder.label}`;
}

/**
 * Generate email body for reminder
 */
function getReminderEmailBody(user: any, reminder: any): string {
  const typeEmojis = {
    medication: "💊",
    hydration: "💧", 
    posture: "🧘",
    custom: "⏰"
  };

  const emoji = typeEmojis[reminder.type as keyof typeof typeEmojis] || "⏰";
  
  let medicationDetails = "";
  if (reminder.type === "medication" && (reminder.medicationName || reminder.dosage)) {
    medicationDetails = `
      <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 16px 0;">
        ${reminder.medicationName ? `<strong>Medication:</strong> ${reminder.medicationName}<br>` : ""}
        ${reminder.dosage ? `<strong>Dosage:</strong> ${reminder.dosage}<br>` : ""}
        ${reminder.instructions ? `<strong>Instructions:</strong> ${reminder.instructions}` : ""}
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Zebby's Reminder</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; font-size: 32px; color: white;">
            🦓
          </div>
          <h1 style="color: #667eea; margin: 0; font-size: 24px;">Zebby's Reminder</h1>
        </div>

        <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <div style="display: flex; align-items: center; margin-bottom: 16px;">
            <span style="font-size: 24px; margin-right: 12px;">${emoji}</span>
            <h2 style="color: #333; margin: 0; font-size: 20px;">${reminder.label}</h2>
          </div>

          ${reminder.description ? `
            <p style="color: #666; margin: 16px 0;">
              ${reminder.description}
            </p>
          ` : ""}

          ${medicationDetails}

          <div style="background: #f0f8ff; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #667eea;">
            <p style="margin: 0; color: #333;">
              <strong>Hi ${user.name || user.email}!</strong><br>
              This is your friendly reminder to take care of yourself. Remember, every small step counts in managing your EDS journey.
            </p>
          </div>

          <div style="text-align: center; margin-top: 24px;">
            <a href="${process.env.APP_URL || 'https://zebbysworld.com'}/dashboard" 
               style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 500;">
              Open Zebby's World
            </a>
          </div>
        </div>

        <div style="text-align: center; margin-top: 24px; color: #666; font-size: 14px;">
          <p>
            You're receiving this because you've set up health reminders in Zebby's World.<br>
            <a href="${process.env.APP_URL || 'https://zebbysworld.com'}/dashboard" style="color: #667eea;">Manage your reminders</a>
          </p>
        </div>

      </body>
    </html>
  `;
}

/**
 * Calculate the next scheduled time for a reminder based on its frequency
 */
function calculateNextScheduledTime(reminder: any, currentTime: Date): Date {
  const nextTime = new Date(currentTime);
  
  switch (reminder.frequency) {
    case "daily":
      nextTime.setDate(nextTime.getDate() + 1);
      break;
    case "weekly":
      nextTime.setDate(nextTime.getDate() + 7);
      break;
    case "custom":
      // For custom frequency, we'll default to daily
      // This could be extended to support custom intervals
      nextTime.setDate(nextTime.getDate() + 1);
      break;
    default:
      nextTime.setDate(nextTime.getDate() + 1);
  }

  // Set the time to the reminder's scheduled time
  if (reminder.timeOfDay) {
    const [hours, minutes] = reminder.timeOfDay.split(':').map(Number);
    nextTime.setHours(hours, minutes, 0, 0);
  }

  return nextTime;
}

/**
 * Manual trigger for reminder processing (for admin/testing)
 */
export async function triggerReminderProcessing(): Promise<{ success: boolean; message: string }> {
  try {
    console.info(JSON.stringify({
      evt: "manual_reminder_processing_triggered",
      timestamp: new Date().toISOString()
    }));

    await processReminders();
    
    return {
      success: true,
      message: "Reminder processing completed successfully"
    };
  } catch (error) {
    console.error(JSON.stringify({
      evt: "manual_reminder_processing_error",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }));
    
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}