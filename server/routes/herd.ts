import { Router } from "express";
import { db } from "../db";
import { herdAlerts, circleMembers, circles, users } from "@shared/schema";
import { eq, and, inArray, gte, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";

const router = Router();

// Rate limiting: 3 reach-outs per hour per user
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 3;
const CANCEL_WINDOW_MINUTES = 10;

// Helper to check rate limit
async function checkRateLimit(userId: string): Promise<{ allowed: boolean; count: number }> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  
  const recentAlerts = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(herdAlerts)
    .where(
      and(
        eq(herdAlerts.userId, userId),
        gte(herdAlerts.createdAt, windowStart)
      )
    );
  
  const count = recentAlerts[0]?.count || 0;
  return { allowed: count < RATE_LIMIT_MAX, count };
}

// POST /api/herd/reach-out - Create pending reach-out alerts with 10-minute cancel window
router.post("/reach-out", async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.user.claims.sub;

    // Check FF_HERD feature flag
    if (process.env.FF_HERD !== "true") {
      return res.status(404).json({ error: "Feature not available" });
    }

    // Validate request body
    const schema = z.object({
      recipients: z.array(z.string()).min(1, "At least one recipient required"),
      message: z.string().max(500).optional(),
    });

    const { recipients, message } = schema.parse(req.body);

    // Check rate limit
    const rateLimit = await checkRateLimit(userId);
    if (!rateLimit.allowed) {
      res.set('Cache-Control', 'no-store');
      return res.status(429).json({ 
        error: "rate_limited",
        message: `You can only send ${RATE_LIMIT_MAX} reach-outs per hour. Please try again later.`,
        count: rateLimit.count,
        limit: RATE_LIMIT_MAX
      });
    }

    // Get user's circle to verify recipients are members
    const [circle] = await db
      .select()
      .from(circles)
      .where(eq(circles.ownerId, userId));

    if (!circle) {
      return res.status(404).json({ error: "Circle not found. Set up your Personal Circle first." });
    }

    // Verify all recipients are active circle members
    const members = await db
      .select({
        id: circleMembers.id,
        userId: circleMembers.userId,
        email: circleMembers.email,
        pseudonym: circleMembers.pseudonym,
      })
      .from(circleMembers)
      .where(
        and(
          eq(circleMembers.circleId, circle.id),
          inArray(circleMembers.userId, recipients),
          eq(circleMembers.status, "active")
        )
      );

    if (members.length === 0) {
      return res.status(404).json({ error: "No active circle members found" });
    }

    if (members.length !== recipients.length) {
      return res.status(400).json({ 
        error: "Some recipients are not active members of your circle" 
      });
    }

    // Generate unique cancel token
    const cancelToken = nanoid(32);
    const windowExpiresAt = new Date(Date.now() + CANCEL_WINDOW_MINUTES * 60 * 1000);

    // Create pending alerts for each recipient
    const alertPromises = members.map(member =>
      db.insert(herdAlerts).values({
        userId,
        recipientUserId: member.userId!,
        status: "pending",
        message: message || null,
        cancelToken,
        windowExpiresAt,
      }).returning()
    );

    const alerts = await Promise.all(alertPromises);

    console.info(JSON.stringify({
      evt: "herd_reach_out_pending",
      userId,
      recipientCount: alerts.length,
      cancelToken,
      expiresAt: windowExpiresAt.toISOString(),
      timestamp: new Date().toISOString()
    }));

    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      cancelToken,
      windowExpiresAt,
      recipientCount: alerts.length,
      message: `Reach-out pending. You have ${CANCEL_WINDOW_MINUTES} minutes to cancel.`
    });
  } catch (error: any) {
    console.error("Error creating reach-out:", error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request", details: error.errors });
    }
    
    res.status(500).json({ error: "Failed to create reach-out" });
  }
});

// POST /api/herd/cancel - Cancel pending reach-out before window expires
router.post("/cancel", async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.user.claims.sub;

    // Validate request body
    const schema = z.object({
      cancelToken: z.string(),
    });

    const { cancelToken } = schema.parse(req.body);

    // Find pending alerts with this token belonging to this user
    const pendingAlerts = await db
      .select()
      .from(herdAlerts)
      .where(
        and(
          eq(herdAlerts.userId, userId),
          eq(herdAlerts.cancelToken, cancelToken),
          eq(herdAlerts.status, "pending")
        )
      );

    if (pendingAlerts.length === 0) {
      return res.status(404).json({ error: "No pending alerts found or already canceled/sent" });
    }

    // Check if window has expired
    const now = new Date();
    const allExpired = pendingAlerts.every(alert => alert.windowExpiresAt < now);
    
    if (allExpired) {
      return res.status(400).json({ 
        error: "Cancel window has expired. Alerts have already been sent." 
      });
    }

    // Cancel all pending alerts with this token
    const canceledAt = new Date();
    await db
      .update(herdAlerts)
      .set({ 
        status: "canceled",
        canceledAt 
      })
      .where(
        and(
          eq(herdAlerts.userId, userId),
          eq(herdAlerts.cancelToken, cancelToken),
          eq(herdAlerts.status, "pending")
        )
      );

    console.info(JSON.stringify({
      evt: "herd_reach_out_canceled",
      userId,
      cancelToken,
      alertCount: pendingAlerts.length,
      timestamp: new Date().toISOString()
    }));

    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      canceled: pendingAlerts.length,
      message: "Reach-out canceled successfully"
    });
  } catch (error: any) {
    console.error("Error canceling reach-out:", error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request", details: error.errors });
    }
    
    res.status(500).json({ error: "Failed to cancel reach-out" });
  }
});

// GET /api/herd/pending - Get user's pending reach-outs
router.get("/pending", async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.user.claims.sub;

    const pending = await db
      .select({
        id: herdAlerts.id,
        recipientUserId: herdAlerts.recipientUserId,
        message: herdAlerts.message,
        cancelToken: herdAlerts.cancelToken,
        createdAt: herdAlerts.createdAt,
        windowExpiresAt: herdAlerts.windowExpiresAt,
      })
      .from(herdAlerts)
      .where(
        and(
          eq(herdAlerts.userId, userId),
          eq(herdAlerts.status, "pending")
        )
      )
      .orderBy(desc(herdAlerts.createdAt));

    res.set('Cache-Control', 'no-store');
    res.json({ pending });
  } catch (error: any) {
    console.error("Error fetching pending reach-outs:", error);
    res.status(500).json({ error: "Failed to fetch pending reach-outs" });
  }
});

// GET /api/herd/audit - Get user's reach-out audit log
router.get("/audit", async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.user.claims.sub;
    const limit = parseInt(req.query.limit as string) || 50;

    const audit = await db
      .select({
        id: herdAlerts.id,
        recipientUserId: herdAlerts.recipientUserId,
        status: herdAlerts.status,
        message: herdAlerts.message,
        createdAt: herdAlerts.createdAt,
        sentAt: herdAlerts.sentAt,
        canceledAt: herdAlerts.canceledAt,
      })
      .from(herdAlerts)
      .where(eq(herdAlerts.userId, userId))
      .orderBy(desc(herdAlerts.createdAt))
      .limit(limit);

    res.set('Cache-Control', 'no-store');
    res.json({ audit });
  } catch (error: any) {
    console.error("Error fetching audit log:", error);
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

export default router;
