import express from "express";
import { db } from "../db";
import { rewardsLedger } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";

const router = express.Router();

/**
 * GET /api/rewards/balance
 * Get user's current rewards point balance
 */
router.get("/balance", async (req: any, res) => {
  try {
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;

    // Calculate balance as sum of all ledger entries
    const result = await db
      .select({ total: sql<number>`COALESCE(SUM(${rewardsLedger.points}), 0)` })
      .from(rewardsLedger)
      .where(eq(rewardsLedger.userId, userId));

    const balance = result[0]?.total || 0;

    res.json({ points: balance });
  } catch (error) {
    console.error("Error fetching rewards balance:", error);
    res.status(500).json({ message: "Failed to fetch rewards balance" });
  }
});

/**
 * GET /api/rewards/history
 * Get user's rewards history (last 20 entries by default)
 */
router.get("/history", async (req: any, res) => {
  try {
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;
    const limit = parseInt(req.query.limit as string) || 20;

    // Get recent ledger entries
    const entries = await db
      .select()
      .from(rewardsLedger)
      .where(eq(rewardsLedger.userId, userId))
      .orderBy(desc(rewardsLedger.createdAt))
      .limit(Math.min(limit, 100)); // Max 100 entries

    res.json(entries);
  } catch (error) {
    console.error("Error fetching rewards history:", error);
    res.status(500).json({ message: "Failed to fetch rewards history" });
  }
});

export default router;
