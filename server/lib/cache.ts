import { db } from "../db";
import { insightsCache } from "../../shared/schema";
import { eq } from "drizzle-orm";

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