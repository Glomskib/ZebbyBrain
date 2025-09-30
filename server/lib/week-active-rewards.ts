import { db } from "../db";
import { referralEvents, rewardsLedger, symptomLogs } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

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
    const now = new Date();

    // Find all signup referral events that need checking
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
    let stillPending = 0;

    for (const event of signupEvents) {
      if (!event.occurredAt) continue;

      // Check if week_active reward already awarded
      const existingWeekActive = await db
        .select()
        .from(referralEvents)
        .where(
          and(
            eq(referralEvents.referrerUserId, event.referrerUserId),
            eq(referralEvents.referredUserId, event.referredUserId),
            eq(referralEvents.eventType, 'week_active')
          )
        );

      if (existingWeekActive.length > 0) {
        // Already rewarded, skip
        continue;
      }

      // Calculate first week window
      const signupDate = new Date(event.occurredAt);
      const firstWeekEnd = new Date(signupDate);
      firstWeekEnd.setDate(firstWeekEnd.getDate() + 7);

      // Only process if first week has ended
      if (now < firstWeekEnd) {
        stillPending++;
        continue;
      }

      // Count active days in first week using UTC-aware date comparison
      const result = await db.execute<{ active_days: string }>(sql`
        SELECT COUNT(DISTINCT DATE(timestamp AT TIME ZONE 'UTC')) as active_days
        FROM symptom_logs
        WHERE user_id = ${event.referredUserId}
          AND timestamp >= ${signupDate.toISOString()}
          AND timestamp < ${firstWeekEnd.toISOString()}
      `);

      const activeDays = parseInt(result.rows?.[0]?.active_days || '0');

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
        // Use transaction for atomic insert with explicit timestamp
        await db.transaction(async (tx) => {
          // Create week_active referral event with explicit occurredAt
          // Set to end of first week for accurate tracking
          await tx.insert(referralEvents).values({
            referrerUserId: event.referrerUserId,
            referredUserId: event.referredUserId,
            eventType: 'week_active',
            occurredAt: firstWeekEnd, // Explicitly set to avoid NOW() default
          });

          // Award +250 points to referrer
          await tx.insert(rewardsLedger).values({
            userId: event.referrerUserId,
            points: 250,
            reason: 'week_active',
            referenceId: event.referredUserId,
          });
        });

        rewardsAwarded++;

        console.info(JSON.stringify({
          evt: "week_active_reward_awarded",
          referrerUserId: event.referrerUserId,
          referredUserId: event.referredUserId,
          points: 250,
          activeDays,
          awardedAt: firstWeekEnd.toISOString(),
          timestamp: new Date().toISOString()
        }));
      }
    }

    console.info(JSON.stringify({
      evt: "week_active_rewards_processing_complete",
      totalSignupEvents: signupEvents.length,
      rewardsAwarded,
      stillPending,
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
