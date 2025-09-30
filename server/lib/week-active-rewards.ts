import { db } from "../db";
import { users, referralEvents, rewardsLedger, symptomLogs } from "@shared/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

/**
 * Process week-active rewards for referrals
 * Awards +250 points to referrers when their referred users are active 5+ days in first week
 * Runs daily at 02:00 UTC via cron
 */
export async function processWeekActiveRewards(): Promise<void> {
  console.info(JSON.stringify({
    evt: "week_active_rewards_processing_start",
    timestamp: new Date().toISOString()
  }));

  try {
    // Find all signup referral events that haven't been rewarded yet
    const signupEvents = await db
      .select({
        id: referralEvents.id,
        referrerUserId: referralEvents.referrerUserId,
        referredUserId: referralEvents.referredUserId,
        occurredAt: referralEvents.occurredAt,
      })
      .from(referralEvents)
      .where(eq(referralEvents.eventType, 'signup'));

    console.info(JSON.stringify({
      evt: "week_active_rewards_signup_events_found",
      count: signupEvents.length,
      timestamp: new Date().toISOString()
    }));

    let rewardsAwarded = 0;

    for (const event of signupEvents) {
      // Check if week_active reward already awarded for this referral
      const existingWeekActiveEvent = await db
        .select()
        .from(referralEvents)
        .where(
          and(
            eq(referralEvents.referrerUserId, event.referrerUserId),
            eq(referralEvents.referredUserId, event.referredUserId),
            eq(referralEvents.eventType, 'week_active')
          )
        );

      if (existingWeekActiveEvent.length > 0) {
        // Already rewarded, skip
        continue;
      }

      // Calculate first week boundaries (signup date + 7 days)
      const signupDate = new Date(event.occurredAt);
      const firstWeekEnd = new Date(signupDate);
      firstWeekEnd.setDate(firstWeekEnd.getDate() + 7);

      // Only process if first week has ended
      const now = new Date();
      if (now < firstWeekEnd) {
        // First week not over yet, skip
        continue;
      }

      // Count active days in first week (days with at least one symptom log)
      const activeDaysResult = await db
        .select({ 
          activeDays: sql<number>`COUNT(DISTINCT DATE(${symptomLogs.timestamp}))`
        })
        .from(symptomLogs)
        .where(
          and(
            eq(symptomLogs.userId, event.referredUserId),
            gte(symptomLogs.timestamp, signupDate.toISOString()),
            lte(symptomLogs.timestamp, firstWeekEnd.toISOString())
          )
        );

      const activeDays = activeDaysResult[0]?.activeDays || 0;

      console.info(JSON.stringify({
        evt: "week_active_rewards_activity_check",
        referredUserId: event.referredUserId,
        signupDate: signupDate.toISOString(),
        firstWeekEnd: firstWeekEnd.toISOString(),
        activeDays,
        meetsThreshold: activeDays >= 5,
        timestamp: new Date().toISOString()
      }));

      // Award if 5+ active days
      if (activeDays >= 5) {
        // Create week_active referral event
        await db.insert(referralEvents).values({
          referrerUserId: event.referrerUserId,
          referredUserId: event.referredUserId,
          eventType: 'week_active',
        });

        // Award +250 points to referrer
        await db.insert(rewardsLedger).values({
          userId: event.referrerUserId,
          points: 250,
          reason: 'week_active',
          referenceId: event.referredUserId,
        });

        rewardsAwarded++;

        console.info(JSON.stringify({
          evt: "week_active_reward_awarded",
          referrerUserId: event.referrerUserId,
          referredUserId: event.referredUserId,
          points: 250,
          activeDays,
          timestamp: new Date().toISOString()
        }));
      }
    }

    console.info(JSON.stringify({
      evt: "week_active_rewards_processing_complete",
      totalSignupEvents: signupEvents.length,
      rewardsAwarded,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    console.error(JSON.stringify({
      evt: "week_active_rewards_processing_error",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }));
    throw error;
  }
}
