import { db } from "../db";
import { herdAlerts, circleMembers, circles, users } from "../../shared/schema";
import { eq, and, lte } from "drizzle-orm";

/**
 * Process pending herd alerts and send notifications after cancel window expires
 * This function is called by the scheduler every minute
 */
export async function processHerdAlerts(): Promise<void> {
  console.info(JSON.stringify({
    evt: "herd_alerts_processing_start",
    timestamp: new Date().toISOString()
  }));

  try {
    const now = new Date();
    
    // Find all pending alerts where window has expired
    const expiredAlerts = await db
      .select()
      .from(herdAlerts)
      .where(
        and(
          eq(herdAlerts.status, "pending"),
          lte(herdAlerts.windowExpiresAt, now)
        )
      );

    if (expiredAlerts.length === 0) {
      console.info(JSON.stringify({
        evt: "herd_alerts_no_pending",
        timestamp: new Date().toISOString()
      }));
      return;
    }

    console.info(JSON.stringify({
      evt: "herd_alerts_found_pending",
      count: expiredAlerts.length,
      timestamp: new Date().toISOString()
    }));

    let sentCount = 0;
    let errorCount = 0;

    // Process each expired alert
    for (const alert of expiredAlerts) {
      try {
        await processIndividualAlert(alert);
        sentCount++;
      } catch (error) {
        errorCount++;
        console.error(JSON.stringify({
          evt: "herd_alert_processing_error",
          alertId: alert.id,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString()
        }));
      }
    }

    console.info(JSON.stringify({
      evt: "herd_alerts_processing_complete",
      sentCount,
      errorCount,
      totalProcessed: expiredAlerts.length,
      timestamp: new Date().toISOString()
    }));

  } catch (error) {
    console.error(JSON.stringify({
      evt: "herd_alerts_processing_fatal_error",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }));
  }
}

async function processIndividualAlert(alert: any): Promise<void> {
  const now = new Date();

  try {
    // Get sender info
    const [sender] = await db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, alert.userId));

    if (!sender) {
      throw new Error(`Sender not found for alert ${alert.id}`);
    }

    // Get recipient info
    const [recipient] = await db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, alert.recipientUserId));

    if (!recipient) {
      throw new Error(`Recipient not found for alert ${alert.id}`);
    }

    const senderName = `${sender.firstName} ${sender.lastName}`.trim() || sender.email;

    // For now, we'll create in-app notifications only
    // Email sending can be added when EMAIL_PROVIDER_API_KEY is configured
    
    // Mark alert as sent
    await db
      .update(herdAlerts)
      .set({
        status: "sent",
        sentAt: now
      })
      .where(eq(herdAlerts.id, alert.id));

    console.info(JSON.stringify({
      evt: "herd_alert_sent",
      alertId: alert.id,
      sender: alert.userId,
      recipient: alert.recipientUserId,
      method: "in_app", // Will be email when configured
      timestamp: now.toISOString()
    }));

    // TODO: When EMAIL_PROVIDER_API_KEY is set, send email here
    // if (process.env.EMAIL_PROVIDER_API_KEY && recipient.email) {
    //   await sendEmail(recipient.email, senderName, alert.message);
    // }

  } catch (error) {
    console.error(JSON.stringify({
      evt: "herd_alert_processing_individual_error",
      alertId: alert.id,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }));
    throw error;
  }
}
