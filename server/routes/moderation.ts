import express from "express";
import { db } from "../db";
import { z } from "zod";
import { 
  groupReports,
  posts,
  groupComments,
  groupMemberships,
  groupBans,
  groups,
  users,
  insertGroupReportSchema,
  insertGroupBanSchema,
  type GroupMembership
} from "@shared/schema";
import { eq, and, sql, desc, or } from "drizzle-orm";

const router = express.Router();

// Helper to get user's membership in a group
async function getUserMembership(userId: string, groupId: string): Promise<GroupMembership | undefined> {
  const [membership] = await db
    .select()
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.userId, userId),
        eq(groupMemberships.groupId, groupId)
      )
    );
  return membership;
}

// Helper to check if user is moderator or owner
async function isModerator(userId: string, groupId: string): Promise<boolean> {
  const membership = await getUserMembership(userId, groupId);
  if (!membership || membership.joinStatus !== 'approved') return false;
  return membership.role === 'owner' || membership.role === 'moderator';
}

// Helper to verify target exists and get its authoritative groupId
async function verifyTargetAndGetGroup(targetType: string, targetId: string): Promise<string | null> {
  if (targetType === 'post') {
    const [post] = await db.select({ groupId: posts.groupId }).from(posts).where(eq(posts.id, targetId));
    return post?.groupId || null;
  } else if (targetType === 'comment') {
    const [comment] = await db.select({ postId: groupComments.postId }).from(groupComments).where(eq(groupComments.id, targetId));
    if (comment) {
      const [post] = await db.select({ groupId: posts.groupId }).from(posts).where(eq(posts.id, comment.postId));
      return post?.groupId || null;
    }
  }
  return null;
}

// Helper to verify user target is an approved member of the group
async function verifyUserTarget(userId: string, groupId: string): Promise<boolean> {
  const [membership] = await db.select().from(groupMemberships).where(
    and(
      eq(groupMemberships.userId, userId),
      eq(groupMemberships.groupId, groupId),
      eq(groupMemberships.joinStatus, 'approved')
    )
  );
  return !!membership;
}

// Content moderation helpers
const FLAGGED_KEYWORDS = [
  'kys', 'kill yourself', 'end yourself',
  'n*gger', 'f*ggot', 'tr*nny',
  'sudoku method', 'night night method',
];

const SEVERE_KEYWORDS = ['suicide', 'self harm', 'cutting', 'overdose'];

function checkForFlaggedContent(text: string): { flagged: boolean; reason?: string } {
  const lowerText = text.toLowerCase();
  
  for (const keyword of FLAGGED_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      return { flagged: true, reason: `Contains prohibited content: ${keyword}` };
    }
  }
  
  for (const keyword of SEVERE_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      return { flagged: true, reason: `Contains sensitive content requiring review: ${keyword}` };
    }
  }
  
  return { flagged: false };
}

// POST /api/moderation/reports - Create a report
router.post("/reports", async (req: any, res) => {
  try {
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;

    // Validate request body - groupId is now required
    const bodySchema = insertGroupReportSchema.extend({
      groupId: z.string().min(1, "groupId is required"),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        message: "Invalid report data", 
        errors: parsed.error.errors 
      });
    }

    const reportData = parsed.data;
    const requestedGroupId = reportData.groupId;

    // Derive authoritative groupId from target to prevent spoofing
    let authoritativeGroupId: string | null = null;

    if (reportData.targetType === 'user') {
      // For user targets, verify they're an approved member in the requested group
      const isValidUserTarget = await verifyUserTarget(reportData.targetId, requestedGroupId);
      if (!isValidUserTarget) {
        return res.status(404).json({ message: "User is not an approved member of this group" });
      }
      authoritativeGroupId = requestedGroupId;
    } else {
      // For post/comment, look up the target's actual group
      authoritativeGroupId = await verifyTargetAndGetGroup(reportData.targetType, reportData.targetId);
      
      if (!authoritativeGroupId) {
        return res.status(404).json({ message: "Target not found" });
      }

      // Verify requested groupId matches target's actual group (prevent spoofing)
      if (authoritativeGroupId !== requestedGroupId) {
        return res.status(400).json({ message: "Target does not belong to the specified group" });
      }
    }

    // Check if reporter is an approved member of the group
    const membership = await getUserMembership(userId, authoritativeGroupId);
    if (!membership || membership.joinStatus !== 'approved') {
      return res.status(403).json({ message: "Not a member of this group" });
    }

    // Check for duplicate report
    const existingReport = await db
      .select()
      .from(groupReports)
      .where(
        and(
          eq(groupReports.reporterId, userId),
          eq(groupReports.groupId, reportData.groupId),
          eq(groupReports.targetType, reportData.targetType),
          eq(groupReports.targetId, reportData.targetId),
          eq(groupReports.status, 'open')
        )
      );

    if (existingReport.length > 0) {
      return res.status(400).json({ message: "You have already reported this content" });
    }

    // Create report
    const [newReport] = await db
      .insert(groupReports)
      .values({
        ...reportData,
        reporterId: userId,
      })
      .returning();

    res.status(201).json(newReport);
  } catch (error) {
    console.error("Error creating report:", error);
    res.status(500).json({ message: "Failed to create report" });
  }
});

// GET /api/moderation/reports?groupId=...&status=... - Get reports for a group (moderator only)
router.get("/reports", async (req: any, res) => {
  try {
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;
    const { groupId, status } = req.query;

    if (!groupId) {
      return res.status(400).json({ message: "groupId is required" });
    }

    // Check if user is moderator
    const isMod = await isModerator(userId, groupId as string);
    if (!isMod) {
      return res.status(403).json({ message: "Moderator access required" });
    }

    // Build query with groupId filter
    let conditions = [eq(groupReports.groupId, groupId as string)];
    if (status) {
      conditions.push(eq(groupReports.status, status as any));
    }

    const reportsData = await db
      .select({
        id: groupReports.id,
        groupId: groupReports.groupId,
        targetType: groupReports.targetType,
        targetId: groupReports.targetId,
        reporterId: groupReports.reporterId,
        reasonCode: groupReports.reasonCode,
        notes: groupReports.notes,
        status: groupReports.status,
        moderatorId: groupReports.moderatorId,
        moderatorAction: groupReports.moderatorAction,
        moderatorNotes: groupReports.moderatorNotes,
        createdAt: groupReports.createdAt,
        resolvedAt: groupReports.resolvedAt,
        reporterName: users.firstName,
      })
      .from(groupReports)
      .leftJoin(users, eq(groupReports.reporterId, users.id))
      .where(and(...conditions))
      .orderBy(desc(groupReports.createdAt));

    res.json(reportsData);
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).json({ message: "Failed to fetch reports" });
  }
});

// PUT /api/moderation/reports/:reportId - Review a report (moderator only)
router.put("/reports/:reportId", async (req: any, res) => {
  try {
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;
    const { reportId } = req.params;

    // Validate request body
    const schema = z.object({
      status: z.enum(['reviewed', 'actioned', 'dismissed']),
      moderatorAction: z.string().optional(),
      moderatorNotes: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        message: "Invalid review data", 
        errors: parsed.error.errors 
      });
    }

    // Get report
    const [report] = await db
      .select()
      .from(groupReports)
      .where(eq(groupReports.id, reportId));

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    // Check if user is moderator of THIS specific group
    const isMod = await isModerator(userId, report.groupId);
    if (!isMod) {
      return res.status(403).json({ message: "Moderator access required" });
    }

    // Update report
    const [updatedReport] = await db
      .update(groupReports)
      .set({
        status: parsed.data.status,
        moderatorAction: parsed.data.moderatorAction,
        moderatorNotes: parsed.data.moderatorNotes,
        moderatorId: userId,
        resolvedAt: new Date(),
      })
      .where(eq(groupReports.id, reportId))
      .returning();

    res.json(updatedReport);
  } catch (error) {
    console.error("Error reviewing report:", error);
    res.status(500).json({ message: "Failed to review report" });
  }
});

// POST /api/moderation/bans - Ban a user from a group (moderator only)
router.post("/bans", async (req: any, res) => {
  try {
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;

    // Validate request body
    const parsed = insertGroupBanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        message: "Invalid ban data", 
        errors: parsed.error.errors 
      });
    }

    const banData = parsed.data;

    // Check if user is moderator
    if (!banData.groupId) {
      return res.status(400).json({ message: "groupId is required" });
    }

    const isMod = await isModerator(userId, banData.groupId);
    if (!isMod) {
      return res.status(403).json({ message: "Moderator access required" });
    }

    // Check if target user is in the group
    const targetMembership = await getUserMembership(banData.userId, banData.groupId);
    if (!targetMembership) {
      return res.status(404).json({ message: "User is not a member of this group" });
    }

    // Prevent banning owners or self
    if (targetMembership.role === 'owner') {
      return res.status(400).json({ message: "Cannot ban group owner" });
    }

    if (banData.userId === userId) {
      return res.status(400).json({ message: "Cannot ban yourself" });
    }

    // Check for existing active ban (not expired)
    const existingBan = await db
      .select()
      .from(groupBans)
      .where(
        and(
          eq(groupBans.groupId, banData.groupId),
          eq(groupBans.userId, banData.userId),
          or(
            sql`${groupBans.expiresAt} IS NULL`,
            sql`${groupBans.expiresAt} > NOW()`
          )
        )
      );

    if (existingBan.length > 0) {
      return res.status(400).json({ message: "User is already banned" });
    }

    // Create ban
    const [newBan] = await db
      .insert(groupBans)
      .values({
        ...banData,
        bannedBy: userId,
      })
      .returning();

    // Remove user from group
    await db
      .delete(groupMemberships)
      .where(
        and(
          eq(groupMemberships.groupId, banData.groupId),
          eq(groupMemberships.userId, banData.userId)
        )
      );

    // Decrement member count only if user was approved
    if (targetMembership.joinStatus === 'approved') {
      await db
        .update(groups)
        .set({ memberCount: sql`GREATEST(${groups.memberCount} - 1, 0)` })
        .where(eq(groups.id, banData.groupId));
    }

    res.status(201).json(newBan);
  } catch (error) {
    console.error("Error creating ban:", error);
    res.status(500).json({ message: "Failed to ban user" });
  }
});

// DELETE /api/moderation/bans/:banId - Unban a user (moderator only)
router.delete("/bans/:banId", async (req: any, res) => {
  try {
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;
    const { banId } = req.params;

    // Get ban
    const [ban] = await db
      .select()
      .from(groupBans)
      .where(eq(groupBans.id, banId));

    if (!ban) {
      return res.status(404).json({ message: "Ban not found" });
    }

    if (!ban.groupId) {
      return res.status(400).json({ message: "Cannot modify platform-wide ban" });
    }

    // Check if user is moderator
    const isMod = await isModerator(userId, ban.groupId);
    if (!isMod) {
      return res.status(403).json({ message: "Moderator access required" });
    }

    // Delete ban (unban)
    await db
      .delete(groupBans)
      .where(eq(groupBans.id, banId));

    res.json({ message: "User unbanned successfully" });
  } catch (error) {
    console.error("Error unbanning user:", error);
    res.status(500).json({ message: "Failed to unban user" });
  }
});

// GET /api/moderation/bans?groupId=... - Get bans for a group (moderator only)
router.get("/bans", async (req: any, res) => {
  try {
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;
    const { groupId } = req.query;

    if (!groupId) {
      return res.status(400).json({ message: "groupId is required" });
    }

    // Check if user is moderator
    const isMod = await isModerator(userId, groupId as string);
    if (!isMod) {
      return res.status(403).json({ message: "Moderator access required" });
    }

    // Get bans with user info
    const bansData = await db
      .select({
        id: groupBans.id,
        groupId: groupBans.groupId,
        userId: groupBans.userId,
        reason: groupBans.reason,
        bannedBy: groupBans.bannedBy,
        expiresAt: groupBans.expiresAt,
        createdAt: groupBans.createdAt,
        userName: users.firstName,
      })
      .from(groupBans)
      .leftJoin(users, eq(groupBans.userId, users.id))
      .where(eq(groupBans.groupId, groupId as string))
      .orderBy(desc(groupBans.createdAt));

    res.json(bansData);
  } catch (error) {
    console.error("Error fetching bans:", error);
    res.status(500).json({ message: "Failed to fetch bans" });
  }
});

// POST /api/moderation/check-content - Check content for flagged keywords (internal use)
router.post("/check-content", async (req: any, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ message: "text is required" });
    }

    const result = checkForFlaggedContent(text);
    res.json(result);
  } catch (error) {
    console.error("Error checking content:", error);
    res.status(500).json({ message: "Failed to check content" });
  }
});

export default router;
