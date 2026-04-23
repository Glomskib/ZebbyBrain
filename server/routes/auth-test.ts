import { Router } from "express";
import jwt from "jsonwebtoken";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { processHerdAlerts } from "../lib/herd-alerts";

const r = Router();

const allow = (process.env.ALLOW_TEST_LOGIN || "").toLowerCase() === "true";
const shared = process.env.TEST_LOGIN_PASSWORD || "";
const JWT_SECRET = process.env.JWT_SECRET;

r.post("/test-login", async (req: any, res) => {
  if (!allow) return res.status(403).json({ error: "disabled" });
  
  const pass = req.headers["x-test-login-password"] || req.body?.password;
  if (!pass || pass !== shared) return res.status(401).json({ error: "bad_password" });

  const email = (req.body?.email as string) || "tester@zebby.local";
  
  try {
    // Find existing user by email
    let [user] = await db.select().from(users).where(eq(users.email, email));
    
    // Create user if not found
    if (!user) {
      [user] = await db.insert(users).values({
        email,
        plan: "free",
        planStatus: "inactive"
      }).returning();
    }
    
    // Create mock session for E2E testing
    // Don't reassign req.session - just set the passport property
    if (!req.session) {
      return res.status(500).json({ error: "session_not_initialized" });
    }
    
    const oneWeekFromNow = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);
    
    req.session.passport = {
      user: {
        claims: {
          sub: user.id,
          email: user.email,
          first_name: user.firstName,
          last_name: user.lastName,
          exp: oneWeekFromNow
        },
        expires_at: oneWeekFromNow
      }
    };
    
    // Save session and return
    req.session.save((err: any) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ error: "session_error" });
      }
      
      res.json({ 
        ok: true, 
        sessionId: req.sessionID,
        user: { 
          id: user.id, 
          email: user.email, 
          plan: user.plan,
          onboardingCompleted: user.onboardingCompleted
        } 
      });
    });
  } catch (error) {
    console.error("Test login error:", error);
    res.status(500).json({ error: "server_error" });
  }
});

// E2E-only: elevate the currently authenticated user to plus plan. Lets
// browser smoke tests exercise premium-gated flows (Doctor Prep, etc).
r.post("/e2e/upgrade-self-to-plus", async (req: any, res) => {
  if (!allow) return res.status(403).json({ error: "disabled" });
  const userId = req.user?.claims?.sub || req.user?.id;
  if (!userId) return res.status(401).json({ error: "unauthenticated" });
  try {
    const [updated] = await db
      .update(users)
      .set({ plan: "plus", planStatus: "active", updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    res.json({ ok: true, plan: updated?.plan, planStatus: updated?.planStatus });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "upgrade_failed" });
  }
});

// E2E-only: Manually trigger herd alert processing
r.post("/e2e/process-herd-alerts", async (req, res) => {
  if (!allow) return res.status(403).json({ error: "disabled" });
  
  // Require password just like test-login
  const pass = req.headers["x-test-login-password"] || req.body?.password;
  if (!pass || pass !== shared) return res.status(401).json({ error: "bad_password" });
  
  try {
    await processHerdAlerts();
    res.json({ ok: true, message: "Herd alerts processed" });
  } catch (error) {
    console.error("E2E herd alert processing error:", error);
    res.status(500).json({ error: "processing_failed" });
  }
});

export default r;