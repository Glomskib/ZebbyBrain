import express from "express";
import { db } from "../db";
import { z } from "zod";
import { 
  circles,
  circleMembers,
  circleScopes,
  circleAlertRules,
  circleAlertLogs,
  circleInviteTokens,
  users,
  symptomLogs,
  symptomEntries,
  vitalsLogs,
  sleepLogs,
  waterIntakeLogs,
  sodiumIntakeLogs,
  insertCircleSchema,
  insertCircleMemberSchema,
  insertCircleScopeSchema,
  insertCircleAlertRuleSchema,
  insertCircleAlertLogSchema,
  insertCircleInviteTokenSchema,
  type Circle,
  type CircleMember,
  type CircleScope,
  type CircleAlertRule
} from "@shared/schema";
import { eq, and, or, sql, desc, gte, lte, inArray } from "drizzle-orm";
import crypto from "crypto";
import { subDays, startOfDay, endOfDay } from "date-fns";
import nodemailer from "nodemailer";

const router = express.Router();

// Generate secure invite token
function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// GET /api/circles/my-circle - Get user's circle with members, scope, and rules
router.get("/my-circle", async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.user.claims.sub;

    // Get or create circle
    let [circle] = await db
      .select()
      .from(circles)
      .where(eq(circles.ownerId, userId));

    if (!circle) {
      // Auto-create circle on first access
      [circle] = await db
        .insert(circles)
        .values({ ownerId: userId, name: "My Circle" })
        .returning();

      // Create default scope
      await db.insert(circleScopes).values({
        circleId: circle.id,
        shareSymptoms: true,
        shareVitals: true,
        shareSleep: false,
        shareHydration: false,
        shareAIReflections: false,
        detailLevel: "summary",
        daysBack: 30,
      });

      // Create default alert rules (inactive)
      await db.insert(circleAlertRules).values({
        circleId: circle.id,
        active: false,
        cooldownMin: 180,
        channelEmail: true,
        channelSMS: false,
        notifyGuardianFirst: true,
      });
    }

    // Get members
    const members = await db
      .select({
        id: circleMembers.id,
        circleId: circleMembers.circleId,
        userId: circleMembers.userId,
        email: circleMembers.email,
        role: circleMembers.role,
        status: circleMembers.status,
        pseudonym: circleMembers.pseudonym,
        createdAt: circleMembers.createdAt,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userProfileImageUrl: users.profileImageUrl,
      })
      .from(circleMembers)
      .leftJoin(users, eq(circleMembers.userId, users.id))
      .where(eq(circleMembers.circleId, circle.id))
      .orderBy(desc(circleMembers.createdAt));

    // Get scope
    const [scope] = await db
      .select()
      .from(circleScopes)
      .where(eq(circleScopes.circleId, circle.id));

    // Get alert rules
    const [alertRule] = await db
      .select()
      .from(circleAlertRules)
      .where(eq(circleAlertRules.circleId, circle.id));

    res.json({
      circle,
      members,
      scope,
      alertRule,
    });
  } catch (error: any) {
    console.error("Error fetching circle:", error);
    res.status(500).json({ error: "Failed to fetch circle" });
  }
});

// POST /api/circles/invite - Invite a member to the circle
router.post("/invite", async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const schema = z.object({
      email: z.string().email(),
      role: z.enum(["member", "guardian"]).default("member"),
      pseudonym: z.string().optional(),
    });

    const { email, role, pseudonym } = schema.parse(req.body);
    const userId = req.user.claims.sub;

    // Get user's circle
    const [circle] = await db
      .select()
      .from(circles)
      .where(eq(circles.ownerId, userId));

    if (!circle) {
      return res.status(404).json({ error: "Circle not found. Initialize circle first." });
    }

    // Check if already invited
    const [existing] = await db
      .select()
      .from(circleMembers)
      .where(
        and(
          eq(circleMembers.circleId, circle.id),
          eq(circleMembers.email, email)
        )
      );

    if (existing) {
      return res.status(400).json({ error: "This email is already invited to your circle" });
    }

    // Create member record (pending status)
    const [member] = await db
      .insert(circleMembers)
      .values({
        circleId: circle.id,
        email,
        role,
        pseudonym,
        status: "pending",
      })
      .returning();

    // Generate invite token
    const token = generateInviteToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.insert(circleInviteTokens).values({
      circleId: circle.id,
      email,
      token,
      expiresAt,
    });

    // TODO: Send invite email with token link

    res.json({
      member,
      inviteUrl: `/circle/accept-invite?token=${token}`,
    });
  } catch (error: any) {
    console.error("Error inviting member:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to invite member" });
  }
});

// GET /api/circles/members - Get all members of user's circle
router.get("/members", async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.user.claims.sub;

    // Get user's circle
    const [circle] = await db
      .select()
      .from(circles)
      .where(eq(circles.ownerId, userId));

    if (!circle) {
      return res.json({ members: [] });
    }

    // Get members with user data
    const members = await db
      .select({
        id: circleMembers.id,
        circleId: circleMembers.circleId,
        userId: circleMembers.userId,
        email: circleMembers.email,
        role: circleMembers.role,
        status: circleMembers.status,
        pseudonym: circleMembers.pseudonym,
        createdAt: circleMembers.createdAt,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userProfileImageUrl: users.profileImageUrl,
      })
      .from(circleMembers)
      .leftJoin(users, eq(circleMembers.userId, users.id))
      .where(eq(circleMembers.circleId, circle.id))
      .orderBy(desc(circleMembers.createdAt));

    res.json({ members });
  } catch (error: any) {
    console.error("Error fetching members:", error);
    res.status(500).json({ error: "Failed to fetch members" });
  }
});

// PATCH /api/circles/members/:memberId/revoke - Revoke member access
router.patch("/members/:memberId/revoke", async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { memberId } = req.params;
    const userId = req.user.claims.sub;

    // Get user's circle
    const [circle] = await db
      .select()
      .from(circles)
      .where(eq(circles.ownerId, userId));

    if (!circle) {
      return res.status(404).json({ error: "Circle not found" });
    }

    // Get member to verify it belongs to this circle
    const [member] = await db
      .select()
      .from(circleMembers)
      .where(
        and(
          eq(circleMembers.id, memberId),
          eq(circleMembers.circleId, circle.id)
        )
      );

    if (!member) {
      return res.status(404).json({ error: "Member not found" });
    }

    // Update status to revoked
    const [updated] = await db
      .update(circleMembers)
      .set({ status: "revoked" })
      .where(eq(circleMembers.id, memberId))
      .returning();

    res.json({ member: updated });
  } catch (error: any) {
    console.error("Error revoking member:", error);
    res.status(500).json({ error: "Failed to revoke member" });
  }
});

// PATCH /api/circles/members/:memberId - Update member details (pseudonym, role)
router.patch("/members/:memberId", async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { memberId } = req.params;
    const userId = req.user.claims.sub;

    const schema = z.object({
      pseudonym: z.string().optional(),
      role: z.enum(["member", "guardian"]).optional(),
    });

    const updates = schema.parse(req.body);

    // Get user's circle
    const [circle] = await db
      .select()
      .from(circles)
      .where(eq(circles.ownerId, userId));

    if (!circle) {
      return res.status(404).json({ error: "Circle not found" });
    }

    // Verify member belongs to this circle
    const [member] = await db
      .select()
      .from(circleMembers)
      .where(
        and(
          eq(circleMembers.id, memberId),
          eq(circleMembers.circleId, circle.id)
        )
      );

    if (!member) {
      return res.status(404).json({ error: "Member not found" });
    }

    // Update member
    const [updated] = await db
      .update(circleMembers)
      .set(updates)
      .where(eq(circleMembers.id, memberId))
      .returning();

    res.json({ member: updated });
  } catch (error: any) {
    console.error("Error updating member:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update member" });
  }
});

// GET /api/circles/scope - Get circle sharing scope
router.get("/scope", async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.user.claims.sub;

    // Get user's circle
    const [circle] = await db
      .select()
      .from(circles)
      .where(eq(circles.ownerId, userId));

    if (!circle) {
      return res.status(404).json({ error: "Circle not found" });
    }

    // Get scope
    const [scope] = await db
      .select()
      .from(circleScopes)
      .where(eq(circleScopes.circleId, circle.id));

    res.json({ scope });
  } catch (error: any) {
    console.error("Error fetching scope:", error);
    res.status(500).json({ error: "Failed to fetch scope" });
  }
});

// PATCH /api/circles/scope - Update circle sharing scope
router.patch("/scope", async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const schema = z.object({
      shareSymptoms: z.boolean().optional(),
      shareVitals: z.boolean().optional(),
      shareSleep: z.boolean().optional(),
      shareHydration: z.boolean().optional(),
      shareAIReflections: z.boolean().optional(),
      detailLevel: z.enum(["summary", "detail"]).optional(),
      daysBack: z.number().int().min(1).max(365).optional(),
    });

    const updates = schema.parse(req.body);
    const userId = req.user.claims.sub;

    // Get user's circle
    const [circle] = await db
      .select()
      .from(circles)
      .where(eq(circles.ownerId, userId));

    if (!circle) {
      return res.status(404).json({ error: "Circle not found" });
    }

    // Update scope
    const [scope] = await db
      .update(circleScopes)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(circleScopes.circleId, circle.id))
      .returning();

    res.json({ scope });
  } catch (error: any) {
    console.error("Error updating scope:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update scope" });
  }
});

// GET /api/circles/alert-rules - Get circle alert rules
router.get("/alert-rules", async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.user.claims.sub;

    // Get user's circle
    const [circle] = await db
      .select()
      .from(circles)
      .where(eq(circles.ownerId, userId));

    if (!circle) {
      return res.status(404).json({ error: "Circle not found" });
    }

    // Get alert rules
    const [alertRule] = await db
      .select()
      .from(circleAlertRules)
      .where(eq(circleAlertRules.circleId, circle.id));

    res.json({ alertRule });
  } catch (error: any) {
    console.error("Error fetching alert rules:", error);
    res.status(500).json({ error: "Failed to fetch alert rules" });
  }
});

// PATCH /api/circles/alert-rules - Update circle alert rules
router.patch("/alert-rules", async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const schema = z.object({
      active: z.boolean().optional(),
      quietStart: z.string().optional().nullable(),
      quietEnd: z.string().optional().nullable(),
      cooldownMin: z.number().int().min(0).optional(),
      flareThreshold: z.number().int().min(1).max(10).optional().nullable(),
      hrDeltaBpm: z.number().int().min(0).optional().nullable(),
      lowSleepHours: z.number().min(0).max(24).optional().nullable(),
      channelEmail: z.boolean().optional(),
      channelSMS: z.boolean().optional(),
      notifyGuardianFirst: z.boolean().optional(),
    });

    const parsed = schema.parse(req.body);
    
    // Convert lowSleepHours to string for decimal field
    const updates = {
      ...parsed,
      lowSleepHours: parsed.lowSleepHours !== undefined && parsed.lowSleepHours !== null 
        ? parsed.lowSleepHours.toString() 
        : parsed.lowSleepHours,
    };
    const userId = req.user.claims.sub;

    // Get user's circle
    const [circle] = await db
      .select()
      .from(circles)
      .where(eq(circles.ownerId, userId));

    if (!circle) {
      return res.status(404).json({ error: "Circle not found" });
    }

    // Update alert rules
    const [alertRule] = await db
      .update(circleAlertRules)
      .set(updates)
      .where(eq(circleAlertRules.circleId, circle.id))
      .returning();

    res.json({ alertRule });
  } catch (error: any) {
    console.error("Error updating alert rules:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update alert rules" });
  }
});

// DELETE /api/circles/members/:memberId - Delete member from circle
router.delete("/members/:memberId", async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { memberId } = req.params;
    const userId = req.user.claims.sub;

    // Get user's circle
    const [circle] = await db
      .select()
      .from(circles)
      .where(eq(circles.ownerId, userId));

    if (!circle) {
      return res.status(404).json({ error: "Circle not found" });
    }

    // Verify member belongs to this circle
    const [member] = await db
      .select()
      .from(circleMembers)
      .where(
        and(
          eq(circleMembers.id, memberId),
          eq(circleMembers.circleId, circle.id)
        )
      );

    if (!member) {
      return res.status(404).json({ error: "Member not found" });
    }

    // Delete member
    await db
      .delete(circleMembers)
      .where(eq(circleMembers.id, memberId));

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting member:", error);
    res.status(500).json({ error: "Failed to delete member" });
  }
});

// ============ MEMBER ENDPOINTS ============

// POST /api/circles/accept-invite - Accept a circle invitation
router.post("/accept-invite", async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const schema = z.object({
      token: z.string(),
    });

    const { token } = schema.parse(req.body);
    const userId = req.user.claims.sub;
    const userEmail = req.user.claims.email;

    // Find and validate token
    const [inviteToken] = await db
      .select()
      .from(circleInviteTokens)
      .where(eq(circleInviteTokens.token, token));

    if (!inviteToken) {
      return res.status(404).json({ error: "Invalid or expired invite token" });
    }

    // Check if token expired
    if (new Date() > inviteToken.expiresAt) {
      return res.status(400).json({ error: "Invite token has expired" });
    }

    // Verify email matches
    if (inviteToken.email !== userEmail) {
      return res.status(403).json({ error: "This invite was sent to a different email address" });
    }

    // Find the pending member record
    const [member] = await db
      .select()
      .from(circleMembers)
      .where(
        and(
          eq(circleMembers.circleId, inviteToken.circleId),
          eq(circleMembers.email, inviteToken.email),
          eq(circleMembers.status, "pending")
        )
      );

    if (!member) {
      return res.status(404).json({ error: "Member invitation not found" });
    }

    // Update member to active and link to user
    const [updatedMember] = await db
      .update(circleMembers)
      .set({ 
        userId,
        status: "active"
      })
      .where(eq(circleMembers.id, member.id))
      .returning();

    // Delete the used token
    await db
      .delete(circleInviteTokens)
      .where(eq(circleInviteTokens.id, inviteToken.id));

    // Get circle info
    const [circle] = await db
      .select()
      .from(circles)
      .where(eq(circles.id, inviteToken.circleId));

    res.json({ 
      success: true,
      member: updatedMember,
      circle
    });
  } catch (error: any) {
    console.error("Error accepting invite:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to accept invite" });
  }
});

// GET /api/circles/member-feed/:ownerId - Get health feed for a circle owner (member view)
router.get("/member-feed/:ownerId", async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ownerId } = req.params;
    const userId = req.user.claims.sub;

    // Get owner's circle
    const [circle] = await db
      .select()
      .from(circles)
      .where(eq(circles.ownerId, ownerId));

    if (!circle) {
      return res.status(404).json({ error: "Circle not found" });
    }

    // Verify user is an active member
    const [membership] = await db
      .select()
      .from(circleMembers)
      .where(
        and(
          eq(circleMembers.circleId, circle.id),
          eq(circleMembers.userId, userId),
          eq(circleMembers.status, "active")
        )
      );

    if (!membership) {
      return res.status(403).json({ error: "You are not an active member of this circle" });
    }

    // Get scope settings
    const [scope] = await db
      .select()
      .from(circleScopes)
      .where(eq(circleScopes.circleId, circle.id));

    if (!scope) {
      return res.status(404).json({ error: "Scope settings not found" });
    }

    // Calculate date range based on daysBack
    const endDate = new Date();
    const startDate = subDays(endDate, scope.daysBack);

    // Build response object with scoped data
    const feedData: any = {
      ownerInfo: {
        circleId: circle.id,
        circleName: circle.name,
        memberRole: membership.role,
      },
      scope: {
        shareSymptoms: scope.shareSymptoms,
        shareVitals: scope.shareVitals,
        shareSleep: scope.shareSleep,
        shareHydration: scope.shareHydration,
        shareAIReflections: scope.shareAIReflections,
        detailLevel: scope.detailLevel,
        daysBack: scope.daysBack,
      },
      data: {}
    };

    // Fetch symptoms if shared
    if (scope.shareSymptoms) {
      const symptoms = await db
        .select({
          id: symptomLogs.id,
          timestamp: symptomLogs.timestamp,
          notes: scope.detailLevel === "detail" ? symptomLogs.notes : sql`NULL`,
          aiReflection: scope.shareAIReflections && scope.detailLevel === "detail" ? symptomLogs.aiReflection : sql`NULL`,
          heartRateBpm: symptomLogs.heartRateBpm,
          weatherTemp: symptomLogs.weatherTemp,
          weatherCondition: symptomLogs.weatherCondition,
        })
        .from(symptomLogs)
        .where(
          and(
            eq(symptomLogs.userId, ownerId),
            gte(symptomLogs.timestamp, startDate),
            lte(symptomLogs.timestamp, endDate)
          )
        )
        .orderBy(desc(symptomLogs.timestamp))
        .limit(50);

      // Fetch symptom entries for each log
      const symptomIds = symptoms.map(s => s.id);
      let entries: any[] = [];
      if (symptomIds.length > 0) {
        entries = await db
          .select({
            symptomLogId: symptomEntries.symptomLogId,
            symptomName: symptomEntries.symptomName,
            intensity: symptomEntries.intensity,
            notes: scope.detailLevel === "detail" ? symptomEntries.notes : sql`NULL`,
          })
          .from(symptomEntries)
          .where(sql`${symptomEntries.symptomLogId} = ANY(${symptomIds})`);
      }

      feedData.data.symptoms = symptoms.map(log => ({
        ...log,
        entries: entries.filter(e => e.symptomLogId === log.id)
      }));
    }

    // Fetch vitals if shared
    if (scope.shareVitals) {
      const vitals = await db
        .select({
          id: vitalsLogs.id,
          timestamp: vitalsLogs.timestamp,
          type: vitalsLogs.type,
          value: vitalsLogs.value,
          unit: vitalsLogs.unit,
          notes: scope.detailLevel === "detail" ? vitalsLogs.notes : sql`NULL`,
        })
        .from(vitalsLogs)
        .where(
          and(
            eq(vitalsLogs.userId, ownerId),
            gte(vitalsLogs.timestamp, startDate),
            lte(vitalsLogs.timestamp, endDate)
          )
        )
        .orderBy(desc(vitalsLogs.timestamp))
        .limit(100);

      feedData.data.vitals = vitals;
    }

    // Fetch sleep if shared
    if (scope.shareSleep) {
      const sleep = await db
        .select({
          id: sleepLogs.id,
          bedtime: sleepLogs.bedtime,
          wakeTime: sleepLogs.wakeTime,
          totalMinutes: sleepLogs.totalMinutes,
          quality: sleepLogs.quality,
          notes: scope.detailLevel === "detail" ? sleepLogs.notes : sql`NULL`,
        })
        .from(sleepLogs)
        .where(
          and(
            eq(sleepLogs.userId, ownerId),
            gte(sleepLogs.bedtime, startDate),
            lte(sleepLogs.bedtime, endDate)
          )
        )
        .orderBy(desc(sleepLogs.bedtime))
        .limit(50);

      feedData.data.sleep = sleep;
    }

    // Fetch hydration if shared
    if (scope.shareHydration) {
      const water = await db
        .select({
          id: waterIntakeLogs.id,
          timestamp: waterIntakeLogs.timestamp,
          amountMl: waterIntakeLogs.amountMl,
        })
        .from(waterIntakeLogs)
        .where(
          and(
            eq(waterIntakeLogs.userId, ownerId),
            gte(waterIntakeLogs.timestamp, startDate),
            lte(waterIntakeLogs.timestamp, endDate)
          )
        )
        .orderBy(desc(waterIntakeLogs.timestamp))
        .limit(100);

      const sodium = await db
        .select({
          id: sodiumIntakeLogs.id,
          timestamp: sodiumIntakeLogs.timestamp,
          amountMg: sodiumIntakeLogs.amountMg,
        })
        .from(sodiumIntakeLogs)
        .where(
          and(
            eq(sodiumIntakeLogs.userId, ownerId),
            gte(sodiumIntakeLogs.timestamp, startDate),
            lte(sodiumIntakeLogs.timestamp, endDate)
          )
        )
        .orderBy(desc(sodiumIntakeLogs.timestamp))
        .limit(100);

      feedData.data.hydration = { water, sodium };
    }

    // Set no-store headers for privacy
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json(feedData);
  } catch (error: any) {
    console.error("Error fetching member feed:", error);
    res.status(500).json({ error: "Failed to fetch member feed" });
  }
});

// GET /api/circles/member-today/:ownerId - Get today's snapshot for a circle owner
router.get("/member-today/:ownerId", async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ownerId } = req.params;
    const userId = req.user.claims.sub;

    // Get owner's circle
    const [circle] = await db
      .select()
      .from(circles)
      .where(eq(circles.ownerId, ownerId));

    if (!circle) {
      return res.status(404).json({ error: "Circle not found" });
    }

    // Verify user is an active member
    const [membership] = await db
      .select()
      .from(circleMembers)
      .where(
        and(
          eq(circleMembers.circleId, circle.id),
          eq(circleMembers.userId, userId),
          eq(circleMembers.status, "active")
        )
      );

    if (!membership) {
      return res.status(403).json({ error: "You are not an active member of this circle" });
    }

    // Get scope settings
    const [scope] = await db
      .select()
      .from(circleScopes)
      .where(eq(circleScopes.circleId, circle.id));

    if (!scope) {
      return res.status(404).json({ error: "Scope settings not found" });
    }

    // Today's date range
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    const snapshot: any = {
      date: new Date().toISOString(),
      circleName: circle.name,
      memberRole: membership.role,
      scope: {
        shareSymptoms: scope.shareSymptoms,
        shareVitals: scope.shareVitals,
        shareSleep: scope.shareSleep,
        shareHydration: scope.shareHydration,
        shareAIReflections: scope.shareAIReflections,
        detailLevel: scope.detailLevel,
        daysBack: scope.daysBack,
      },
      data: {}
    };

    // Get today's symptoms
    if (scope.shareSymptoms) {
      const [latestSymptom] = await db
        .select({
          id: symptomLogs.id,
          timestamp: symptomLogs.timestamp,
          heartRateBpm: symptomLogs.heartRateBpm,
        })
        .from(symptomLogs)
        .where(
          and(
            eq(symptomLogs.userId, ownerId),
            gte(symptomLogs.timestamp, todayStart),
            lte(symptomLogs.timestamp, todayEnd)
          )
        )
        .orderBy(desc(symptomLogs.timestamp))
        .limit(1);

      if (latestSymptom) {
        const entries = await db
          .select({
            symptomName: symptomEntries.symptomName,
            intensity: symptomEntries.intensity,
          })
          .from(symptomEntries)
          .where(eq(symptomEntries.symptomLogId, latestSymptom.id));

        snapshot.data.latestSymptoms = {
          timestamp: latestSymptom.timestamp,
          entries: entries,
          heartRate: latestSymptom.heartRateBpm,
        };
      }
    }

    // Get latest vitals
    if (scope.shareVitals) {
      const recentVitals = await db
        .select({
          type: vitalsLogs.type,
          value: vitalsLogs.value,
          unit: vitalsLogs.unit,
          timestamp: vitalsLogs.timestamp,
        })
        .from(vitalsLogs)
        .where(
          and(
            eq(vitalsLogs.userId, ownerId),
            gte(vitalsLogs.timestamp, todayStart)
          )
        )
        .orderBy(desc(vitalsLogs.timestamp))
        .limit(5);

      snapshot.data.recentVitals = recentVitals;
    }

    // Get today's hydration totals
    if (scope.shareHydration) {
      const [waterTotal] = await db
        .select({
          total: sql<number>`SUM(${waterIntakeLogs.amountMl})`,
        })
        .from(waterIntakeLogs)
        .where(
          and(
            eq(waterIntakeLogs.userId, ownerId),
            gte(waterIntakeLogs.timestamp, todayStart),
            lte(waterIntakeLogs.timestamp, todayEnd)
          )
        );

      const [sodiumTotal] = await db
        .select({
          total: sql<number>`SUM(${sodiumIntakeLogs.amountMg})`,
        })
        .from(sodiumIntakeLogs)
        .where(
          and(
            eq(sodiumIntakeLogs.userId, ownerId),
            gte(sodiumIntakeLogs.timestamp, todayStart),
            lte(sodiumIntakeLogs.timestamp, todayEnd)
          )
        );

      snapshot.data.todayHydration = {
        waterMl: waterTotal?.total || 0,
        sodiumMg: sodiumTotal?.total || 0,
      };
    }

    // Get last night's sleep
    if (scope.shareSleep) {
      const yesterday = subDays(new Date(), 1);
      const [lastSleep] = await db
        .select({
          bedtime: sleepLogs.bedtime,
          wakeTime: sleepLogs.wakeTime,
          totalMinutes: sleepLogs.totalMinutes,
          quality: sleepLogs.quality,
        })
        .from(sleepLogs)
        .where(
          and(
            eq(sleepLogs.userId, ownerId),
            gte(sleepLogs.bedtime, yesterday)
          )
        )
        .orderBy(desc(sleepLogs.bedtime))
        .limit(1);

      snapshot.data.lastSleep = lastSleep || null;
    }

    // Set no-store headers for privacy
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json(snapshot);
  } catch (error: any) {
    console.error("Error fetching today snapshot:", error);
    res.status(500).json({ error: "Failed to fetch today snapshot" });
  }
});

// Helper function to get email transporter
function getEmailTransporter(): nodemailer.Transporter | null {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// POST /api/circles/cancel-pending-alert/:alertId - Cancel a pending alert
router.post("/cancel-pending-alert/:alertId", async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { alertId } = req.params;
    const userId = req.user.claims.sub;

    // Get the pending alert and verify ownership
    const [pendingAlert] = await db
      .select({
        id: circlePendingAlerts.id,
        circleId: circlePendingAlerts.circleId,
        ownerId: circles.ownerId,
        canceledAt: circlePendingAlerts.canceledAt,
      })
      .from(circlePendingAlerts)
      .innerJoin(circles, eq(circlePendingAlerts.circleId, circles.id))
      .where(eq(circlePendingAlerts.id, alertId));

    if (!pendingAlert) {
      return res.status(404).json({ error: "Pending alert not found" });
    }

    if (pendingAlert.ownerId !== userId) {
      return res.status(403).json({ error: "You can only cancel your own alerts" });
    }

    if (pendingAlert.canceledAt) {
      return res.status(400).json({ error: "Alert already cancelled" });
    }

    // Cancel the alert
    await db
      .update(circlePendingAlerts)
      .set({ canceledAt: new Date() })
      .where(eq(circlePendingAlerts.id, alertId));

    res.json({ 
      success: true,
      message: "Alert cancelled successfully"
    });
  } catch (error: any) {
    console.error("Error cancelling pending alert:", error);
    res.status(500).json({ error: "Failed to cancel alert" });
  }
});

// GET /api/circles/pending-alerts - Get pending alerts for user's circle
router.get("/pending-alerts", async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.user.claims.sub;

    // Get user's circle
    const [circle] = await db
      .select()
      .from(circles)
      .where(eq(circles.ownerId, userId));

    if (!circle) {
      return res.json({ pendingAlerts: [] });
    }

    // Get pending alerts
    const pendingAlerts = await db
      .select({
        id: circlePendingAlerts.id,
        triggerReason: circlePendingAlerts.triggerReason,
        scheduledFor: circlePendingAlerts.scheduledFor,
        createdAt: circlePendingAlerts.createdAt,
        canceledAt: circlePendingAlerts.canceledAt,
      })
      .from(circlePendingAlerts)
      .where(eq(circlePendingAlerts.circleId, circle.id))
      .orderBy(desc(circlePendingAlerts.createdAt));

    res.json({ pendingAlerts });
  } catch (error: any) {
    console.error("Error fetching pending alerts:", error);
    res.status(500).json({ error: "Failed to fetch pending alerts" });
  }
});

// POST /api/circles/reach-out - Manual reach out to selected members
router.post("/reach-out", async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.user.claims.sub;

    // Validate request body
    const reachOutSchema = z.object({
      memberIds: z.array(z.number()).min(1, "At least one member must be selected"),
      message: z.string().optional(),
    });

    const validatedData = reachOutSchema.parse(req.body);
    const { memberIds, message } = validatedData;

    // Get user's circle
    const [circle] = await db
      .select()
      .from(circles)
      .where(eq(circles.ownerId, userId));

    if (!circle) {
      return res.status(404).json({ error: "Circle not found" });
    }

    // Get selected members and verify they belong to this circle
    const members = await db
      .select({
        id: circleMembers.id,
        email: circleMembers.email,
        pseudonym: circleMembers.pseudonym,
        role: circleMembers.role,
        userId: circleMembers.userId,
      })
      .from(circleMembers)
      .leftJoin(users, eq(circleMembers.userId, users.id))
      .where(
        and(
          eq(circleMembers.circleId, circle.id),
          inArray(circleMembers.id, memberIds),
          eq(circleMembers.status, "active")
        )
      );

    if (members.length === 0) {
      return res.status(404).json({ error: "No active members found" });
    }

    if (members.length !== memberIds.length) {
      return res.status(400).json({ 
        error: "Some selected members are not active members of your circle" 
      });
    }

    // Get circle owner info
    const [owner] = await db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!owner) {
      return res.status(404).json({ error: "Owner not found" });
    }

    const ownerName = `${owner.firstName} ${owner.lastName}`.trim() || owner.email;

    // Send emails to selected members
    const transporter = getEmailTransporter();
    const emailResults: Array<{ memberId: number; email: string; sent: boolean; error?: string }> = [];

    for (const member of members) {
      try {
        // Log the reach out
        await db.insert(circleAlertLogs).values({
          circleId: circle.id,
          toMemberId: member.id,
          alertType: "manual",
          message: message || "I could use some support right now.",
          sentAt: new Date(),
          cancelledAt: null,
        });

        // Send email if transporter is configured
        if (transporter && member.email) {
          const emailSubject = `${ownerName} needs your support`;
          const emailBody = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #6366f1;">Someone in your circle needs support</h2>
              <p><strong>${ownerName}</strong> has reached out to you through Zebby's World Personal Circle.</p>
              ${message ? `<p style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;"><em>"${message}"</em></p>` : ''}
              <p>This is a manual reach out, which means they specifically thought of you and wanted you to know they could use some support.</p>
              <p style="margin-top: 30px;">
                <a href="${process.env.VITE_APP_URL || 'https://zebbysworld.com'}/circle/member-view" 
                   style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  View Their Health Updates
                </a>
              </p>
              <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                You're receiving this because you're a member of ${ownerName}'s Personal Circle on Zebby's World.
              </p>
            </div>
          `;

          await transporter.sendMail({
            from: process.env.SMTP_FROM_EMAIL || "noreply@zebbysworld.com",
            to: member.email,
            subject: emailSubject,
            html: emailBody,
          });

          emailResults.push({ memberId: member.id, email: member.email, sent: true });
          
          console.info(JSON.stringify({
            evt: "reach_out_email_sent",
            circleId: circle.id,
            memberId: member.id,
            memberEmail: member.email,
            timestamp: new Date().toISOString()
          }));
        } else {
          emailResults.push({ 
            memberId: member.id, 
            email: member.email || "no email", 
            sent: false,
            error: transporter ? "No email address" : "Email not configured"
          });
        }
      } catch (emailError: any) {
        console.error(`Error sending reach out to member ${member.id}:`, emailError);
        emailResults.push({ 
          memberId: member.id, 
          email: member.email || "unknown", 
          sent: false,
          error: emailError.message 
        });
      }
    }

    res.json({ 
      success: true,
      message: "Reach out notifications sent",
      results: emailResults,
    });
  } catch (error: any) {
    console.error("Error processing reach out:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: "Failed to process reach out" });
  }
});

export default router;
