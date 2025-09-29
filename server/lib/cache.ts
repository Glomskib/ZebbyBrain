import { db } from "../db";
import { insightsCache, symptomLogs, vitalsLogs, sleepLogs } from "../../shared/schema";
import { eq, gte } from "drizzle-orm";
import { computeInsights } from "./insights";

/**
 * Invalidate insights cache for a user
 * Called after any insert/update/delete to symptom_logs, vitals_logs, or sleep_logs
 */
export async function invalidateInsightsCache(userId: string) {
  try {
    await db.delete(insightsCache).where(eq(insightsCache.userId, userId));
    console.info(JSON.stringify({
      evt: "cache_invalidated",
      userId,
      cacheType: "insights",
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    console.error(JSON.stringify({
      evt: "cache_invalidation_error",
      userId,
      cacheType: "insights",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }));
    throw error;
  }
}

/**
 * Structured performance logging for API endpoints
 */
export function logApiPerformance(req: any, res: any, startTime: number, cacheHit?: boolean) {
  const ms = Date.now() - startTime;
  console.info(JSON.stringify({
    evt: "api_perf",
    path: req.path,
    userId: req.user?.id || "anon",
    ms,
    cache: cacheHit ? "hit" : "miss",
    status: res.statusCode,
    timestamp: new Date().toISOString()
  }));
}

/**
 * Identify active users who have health data in the last 7 days
 * These users will have their insights cache precomputed nightly
 */
export async function getActiveUsers(): Promise<string[]> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  try {
    // Find users with recent health data (symptoms, vitals, or sleep logs)
    // Use separate queries and merge in code since Drizzle union chains don't work as expected
    const [symptomUsers, vitalsUsers, sleepUsers] = await Promise.all([
      db
        .selectDistinct({ userId: symptomLogs.userId })
        .from(symptomLogs)
        .where(gte(symptomLogs.timestamp, sevenDaysAgo)),
      db
        .selectDistinct({ userId: vitalsLogs.userId })
        .from(vitalsLogs)
        .where(gte(vitalsLogs.timestamp, sevenDaysAgo)),
      db
        .selectDistinct({ userId: sleepLogs.userId })
        .from(sleepLogs)
        .where(gte(sleepLogs.timestamp, sevenDaysAgo))
    ]);

    // Merge and deduplicate user IDs
    const allUserIds = new Set([
      ...symptomUsers.map(row => row.userId),
      ...vitalsUsers.map(row => row.userId),
      ...sleepUsers.map(row => row.userId)
    ]);

    const userIds = Array.from(allUserIds).filter(Boolean);
    console.info(JSON.stringify({
      evt: "active_users_identified",
      count: userIds.length,
      timestamp: new Date().toISOString()
    }));
    
    return userIds;
  } catch (error) {
    console.error(JSON.stringify({
      evt: "active_users_error",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }));
    return [];
  }
}

/**
 * Precompute insights cache for a single user across all ranges
 */
export async function precomputeUserInsights(userId: string): Promise<void> {
  const ranges: Array<"7d" | "30d" | "90d"> = ["7d", "30d", "90d"];
  
  for (const range of ranges) {
    try {
      const startTime = Date.now();
      const payload = await computeInsights(userId, range);
      
      // Store in cache
      await db
        .insert(insightsCache)
        .values({
          userId,
          rangeKey: range,
          payload,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [insightsCache.userId, insightsCache.rangeKey],
          set: {
            payload,
            updatedAt: new Date(),
          },
        });

      const ms = Date.now() - startTime;
      console.info(JSON.stringify({
        evt: "insights_precomputed",
        userId,
        range,
        ms,
        timestamp: new Date().toISOString()
      }));
      
    } catch (error) {
      console.error(JSON.stringify({
        evt: "insights_precompute_error",
        userId,
        range,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      }));
    }
  }
}

/**
 * Nightly cron job to precompute insights cache for active users
 * Improves performance by having insights ready during peak hours
 */
export async function precomputeInsightsForActiveUsers(): Promise<void> {
  const startTime = Date.now();
  console.info(JSON.stringify({
    evt: "insights_precompute_start",
    timestamp: new Date().toISOString()
  }));

  try {
    const activeUsers = await getActiveUsers();
    
    if (activeUsers.length === 0) {
      console.info(JSON.stringify({
        evt: "insights_precompute_complete",
        usersProcessed: 0,
        ms: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }));
      return;
    }

    // Process users in batches to avoid overwhelming the database
    const batchSize = 10;
    let processed = 0;
    
    for (let i = 0; i < activeUsers.length; i += batchSize) {
      const batch = activeUsers.slice(i, i + batchSize);
      
      // Process batch concurrently but with reasonable limits
      await Promise.all(
        batch.map(userId => precomputeUserInsights(userId))
      );
      
      processed += batch.length;
      console.info(JSON.stringify({
        evt: "insights_precompute_progress",
        processed,
        total: activeUsers.length,
        timestamp: new Date().toISOString()
      }));
      
      // Small delay between batches to be gentle on the database
      if (i + batchSize < activeUsers.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const totalMs = Date.now() - startTime;
    console.info(JSON.stringify({
      evt: "insights_precompute_complete",
      usersProcessed: processed,
      ms: totalMs,
      avgMsPerUser: Math.round(totalMs / processed),
      timestamp: new Date().toISOString()
    }));
    
  } catch (error) {
    console.error(JSON.stringify({
      evt: "insights_precompute_error",
      error: error instanceof Error ? error.message : "Unknown error",
      ms: Date.now() - startTime,
      timestamp: new Date().toISOString()
    }));
  }
}