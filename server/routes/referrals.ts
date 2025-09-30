import express from "express";
import { db } from "../db";
import { z } from "zod";
import { users, referralEvents, rewardsLedger } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from 'nanoid';

const router = express.Router();

// Helper to set no-store headers for privacy
function setNoStoreHeaders(res: express.Response) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
}

/**
 * GET /api/referrals/code
 * Returns or generates user's referral code
 */
router.get("/code", async (req: any, res) => {
  try {
    setNoStoreHeaders(res);
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;

    // Get user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate referral code if user doesn't have one
    if (!user.referralCode) {
      const code = nanoid(10);
      
      await db
        .update(users)
        .set({ referralCode: code })
        .where(eq(users.id, userId));

      return res.json({ code });
    }

    res.json({ code: user.referralCode });
  } catch (error) {
    console.error("Error getting referral code:", error);
    res.status(500).json({ message: "Failed to get referral code" });
  }
});

/**
 * POST /api/referrals/apply
 * Apply a referral code to current user (once)
 */
router.post("/apply", async (req: any, res) => {
  try {
    setNoStoreHeaders(res);
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;

    // Validate request
    const schema = z.object({
      code: z.string().min(1),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        message: "Invalid referral code", 
        errors: parsed.error.errors 
      });
    }

    const { code } = parsed.data;

    // Find referrer by code
    const [referrer] = await db
      .select()
      .from(users)
      .where(eq(users.referralCode, code));

    if (!referrer) {
      return res.status(404).json({ message: "Invalid referral code" });
    }

    // Can't refer yourself
    if (referrer.id === userId) {
      return res.status(400).json({ message: "Cannot use your own referral code" });
    }

    // Check if user already has a referrer (prevent duplicate applications)
    const existingEvent = await db
      .select()
      .from(referralEvents)
      .where(
        and(
          eq(referralEvents.referredUserId, userId),
          eq(referralEvents.eventType, 'signup')
        )
      );

    if (existingEvent.length > 0) {
      return res.status(400).json({ message: "Referral code already applied" });
    }

    // Create referral event (signup)
    await db.insert(referralEvents).values({
      referrerUserId: referrer.id,
      referredUserId: userId,
      eventType: 'signup',
    });

    // Award +100 points to referrer for signup
    await db.insert(rewardsLedger).values({
      userId: referrer.id,
      points: 100,
      reason: 'invite_confirmed',
      referenceId: userId, // Reference to the referred user
    });

    res.json({ message: "Referral code applied successfully" });
  } catch (error) {
    console.error("Error applying referral code:", error);
    
    // Handle unique constraint violation (race condition)
    if ((error as any).code === '23505') {
      return res.status(400).json({ message: "Referral code already applied" });
    }

    res.status(500).json({ message: "Failed to apply referral code" });
  }
});

export default router;
