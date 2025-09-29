import { Router } from "express";
import rateLimit from "express-rate-limit";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import { computeInsights, type RangeKey } from "../lib/insights";
import { insightsCache } from "../../shared/schema";
import { logApiPerformance } from "../lib/cache";
import { triggerInsightsPrecompute } from "../cron";

const router = Router();

// Gentle rate limiting for insights
router.use(rateLimit({ 
  windowMs: 60_000, // 1 minute window
  max: 12, // 12 requests per minute per IP
  message: { message: "Too many insight requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
}));

function parseRange(q?: string): RangeKey {
  if (q === "7d" || q === "30d" || q === "90d") return q;
  return "30d";
}

/**
 * GET /api/insights/snapshot?range=7d|30d|90d
 * Returns EDS-specific health insights with caching
 * Requires authentication (checked by requireAuth middleware applied in routes.ts)
 */
router.get("/snapshot", async (req, res) => {
  const startTime = Date.now();
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const range = parseRange(req.query.range as string);

    // Check cache first (5-minute TTL)
    const cacheResult = await db
      .select({
        payload: insightsCache.payload,
        updatedAt: insightsCache.updatedAt,
      })
      .from(insightsCache)
      .where(
        and(
          eq(insightsCache.userId, userId),
          eq(insightsCache.rangeKey, range)
        )
      )
      .limit(1);

    if (cacheResult.length > 0) {
      const cache = cacheResult[0];
      const updatedAtDate = cache.updatedAt ? new Date(cache.updatedAt) : new Date();
      const ageMs = Date.now() - updatedAtDate.getTime();
      if (ageMs < 5 * 60 * 1000) { // 5 minutes
        // Return cached result with security headers
        res.setHeader("Cache-Control", "no-store");
        logApiPerformance(req, res, startTime, true); // Cache hit
        return res.json(cache.payload);
      }
    }

    // Compute fresh insights
    const payload = await computeInsights(userId, range);

    // Update or insert cache
    await db
      .insert(insightsCache)
      .values({
        userId,
        rangeKey: range,
        payload,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [insightsCache.userId, insightsCache.rangeKey],
        set: {
          payload,
          updatedAt: new Date(),
        },
      });

    // Return fresh insights with security headers
    res.setHeader("Cache-Control", "no-store");
    logApiPerformance(req, res, startTime, false); // Cache miss
    return res.json(payload);
  } catch (error) {
    console.error("Error generating insights:", error);
    return res.status(500).json({ 
      error: "Failed to generate insights",
      message: "Please try again later"
    });
  }
});

/**
 * DELETE /api/insights/cache
 * Clear insights cache for the authenticated user
 */
router.delete("/cache", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    await db
      .delete(insightsCache)
      .where(eq(insightsCache.userId, userId));

    return res.json({ message: "Cache cleared successfully" });
  } catch (error) {
    console.error("Error clearing insights cache:", error);
    return res.status(500).json({ 
      error: "Failed to clear cache"
    });
  }
});

/**
 * POST /api/insights/precompute
 * Admin endpoint to manually trigger insights precomputation for all active users
 * Useful for testing and manual maintenance
 */
router.post("/precompute", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Only allow in development or for specific admin users
    if (process.env.NODE_ENV !== "development") {
      return res.status(403).json({ 
        error: "Precompute endpoint only available in development" 
      });
    }

    console.info(JSON.stringify({
      evt: "manual_precompute_requested",
      triggeredBy: userId,
      timestamp: new Date().toISOString()
    }));

    // Trigger precomputation asynchronously (fire-and-forget)
    // Don't await to avoid blocking the HTTP response
    triggerInsightsPrecompute().catch(error => {
      console.error(JSON.stringify({
        evt: "manual_precompute_background_error",
        triggeredBy: userId,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      }));
    });

    // Return immediately to avoid request timeouts
    return res.json({
      message: "Insights precomputation started in background",
      success: true,
      triggeredAt: new Date().toISOString(),
      note: "Check server logs for progress updates"
    });
    
  } catch (error) {
    console.error("Error triggering insights precomputation:", error);
    return res.status(500).json({ 
      error: "Failed to trigger precomputation",
      message: "Please try again later"
    });
  }
});

export default router;