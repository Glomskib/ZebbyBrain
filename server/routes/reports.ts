import express from "express";
import { db } from "../db";
import { z } from "zod";
import { 
  groupReports, 
  insertGroupReportSchema,
  posts,
  groupComments,
  users,
  groups,
  groupMemberships,
  type GroupMembership
} from "@shared/schema";
import { reportRateLimit } from "../middleware/rateLimits";
import { eq, and, sql, desc, inArray } from "drizzle-orm";

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

// Helper to check if user has moderator permissions
async function isModerator(userId: string, groupId: string): Promise<boolean> {
  const membership = await getUserMembership(userId, groupId);
  if (!membership || membership.joinStatus !== 'approved') return false;
  return membership.role === 'owner' || membership.role === 'moderator';
}

// Helper to set no-store headers for privacy
function setNoStoreHeaders(res: express.Response) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
}

/**
 * POST /api/report
 * Report content (posts or comments) for moderation
 */
router.post("/", reportRateLimit, async (req: any, res) => {
  try {
    setNoStoreHeaders(res);
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;

    // Validate request
    const schema = insertGroupReportSchema.extend({
      reasonCode: z.string().min(1),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        message: "Invalid report data", 
        errors: parsed.error.errors 
      });
    }

    const reportData = parsed.data;

    // Validate that target content belongs to the reported group
    if (reportData.targetType === 'post') {
      const [post] = await db
        .select({ groupId: posts.groupId })
        .from(posts)
        .where(eq(posts.id, reportData.targetId));

      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      if (post.groupId !== reportData.groupId) {
        return res.status(400).json({ message: "Post does not belong to the specified group" });
      }
    } else if (reportData.targetType === 'comment') {
      const [comment] = await db
        .select({ 
          postId: groupComments.postId,
          post: { groupId: posts.groupId }
        })
        .from(groupComments)
        .innerJoin(posts, eq(groupComments.postId, posts.id))
        .where(eq(groupComments.id, reportData.targetId));

      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }

      if (comment.post.groupId !== reportData.groupId) {
        return res.status(400).json({ message: "Comment does not belong to the specified group" });
      }
    }

    // Create report
    const [newReport] = await db
      .insert(groupReports)
      .values({
        ...reportData,
        reporterId: userId,
        status: 'open',
      })
      .returning();

    res.status(201).json({ 
      message: "Report submitted successfully",
      reportId: newReport.id
    });
  } catch (error) {
    console.error("Error creating report:", error);
    res.status(500).json({ message: "Failed to submit report" });
  }
});

/**
 * GET /api/reports?groupId=...
 * Get reports for a group (moderators only)
 */
router.get("/", async (req: any, res) => {
  try {
    setNoStoreHeaders(res);
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;
    const { groupId, status = 'open' } = req.query;

    if (!groupId) {
      return res.status(400).json({ message: "groupId is required" });
    }

    // Check if user is a moderator of this group
    if (!await isModerator(userId, groupId)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    // Get reports with target content details
    const reports = await db
      .select({
        id: groupReports.id,
        groupId: groupReports.groupId,
        targetType: groupReports.targetType,
        targetId: groupReports.targetId,
        reporterId: groupReports.reporterId,
        reporterName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
        reasonCode: groupReports.reasonCode,
        notes: groupReports.notes,
        status: groupReports.status,
        moderatorAction: groupReports.moderatorAction,
        moderatorNotes: groupReports.moderatorNotes,
        createdAt: groupReports.createdAt,
        resolvedAt: groupReports.resolvedAt,
      })
      .from(groupReports)
      .innerJoin(users, eq(groupReports.reporterId, users.id))
      .where(
        and(
          eq(groupReports.groupId, groupId),
          status ? eq(groupReports.status, status) : undefined
        )
      )
      .orderBy(desc(groupReports.createdAt));

    // Fetch target content details for each report
    const reportsWithContent = await Promise.all(
      reports.map(async (report) => {
        let targetContent = null;

        if (report.targetType === 'post') {
          const [post] = await db
            .select({
              body: posts.body,
              authorId: posts.authorId,
              authorName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
              isRemoved: posts.isRemoved,
            })
            .from(posts)
            .innerJoin(users, eq(posts.authorId, users.id))
            .where(eq(posts.id, report.targetId));
          targetContent = post;
        } else if (report.targetType === 'comment') {
          const [comment] = await db
            .select({
              body: groupComments.body,
              authorId: groupComments.authorId,
              authorName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
              isRemoved: groupComments.isRemoved,
            })
            .from(groupComments)
            .innerJoin(users, eq(groupComments.authorId, users.id))
            .where(eq(groupComments.id, report.targetId));
          targetContent = comment;
        }

        return {
          ...report,
          targetContent,
        };
      })
    );

    res.json(reportsWithContent);
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).json({ message: "Failed to fetch reports" });
  }
});

/**
 * PATCH /api/reports/:reportId
 * Update report status and take action (moderators only)
 */
router.patch("/:reportId", async (req: any, res) => {
  try {
    setNoStoreHeaders(res);
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;
    const { reportId } = req.params;

    // Validate request
    const schema = z.object({
      status: z.enum(['open', 'reviewed', 'actioned', 'dismissed']),
      moderatorAction: z.enum(['removed', 'muted', 'banned', 'no_action']).optional(),
      moderatorNotes: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        message: "Invalid request data", 
        errors: parsed.error.errors 
      });
    }

    const { status, moderatorAction, moderatorNotes } = parsed.data;

    // Get report
    const [report] = await db
      .select()
      .from(groupReports)
      .where(eq(groupReports.id, reportId));

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    // Check if user is a moderator of the group
    if (!await isModerator(userId, report.groupId)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    // Apply moderator action if specified
    if (moderatorAction === 'removed') {
      if (report.targetType === 'post') {
        // Verify post belongs to the reported group
        const [post] = await db
          .select({ groupId: posts.groupId })
          .from(posts)
          .where(eq(posts.id, report.targetId));

        if (!post || post.groupId !== report.groupId) {
          return res.status(400).json({ message: "Target post does not belong to this group" });
        }

        await db
          .update(posts)
          .set({ isRemoved: true })
          .where(eq(posts.id, report.targetId));
      } else if (report.targetType === 'comment') {
        // Verify comment belongs to a post in the reported group
        const [comment] = await db
          .select({ 
            postId: groupComments.postId,
            post: { groupId: posts.groupId }
          })
          .from(groupComments)
          .innerJoin(posts, eq(groupComments.postId, posts.id))
          .where(eq(groupComments.id, report.targetId));

        if (!comment || comment.post.groupId !== report.groupId) {
          return res.status(400).json({ message: "Target comment does not belong to this group" });
        }

        await db
          .update(groupComments)
          .set({ isRemoved: true })
          .where(eq(groupComments.id, report.targetId));
      }
    }

    // Update report
    const [updatedReport] = await db
      .update(groupReports)
      .set({
        status,
        moderatorId: userId,
        moderatorAction,
        moderatorNotes,
        resolvedAt: status !== 'open' ? new Date() : null,
      })
      .where(eq(groupReports.id, reportId))
      .returning();

    res.json(updatedReport);
  } catch (error) {
    console.error("Error updating report:", error);
    res.status(500).json({ message: "Failed to update report" });
  }
});

export default router;
