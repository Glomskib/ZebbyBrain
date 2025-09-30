import express from "express";
import { db } from "../db";
import { z } from "zod";
import { commentRateLimit, reactionRateLimit } from "../middleware/rateLimits";
import { 
  groupComments,
  reactions,
  posts,
  groups,
  groupMemberships,
  users,
  insertGroupCommentSchema,
  insertReactionSchema,
  type GroupMembership
} from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";

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

// Helper to check if user has permission in group
async function hasPermission(
  userId: string, 
  groupId: string, 
  requiredRoles: ('owner' | 'moderator' | 'member')[]
): Promise<boolean> {
  const membership = await getUserMembership(userId, groupId);
  if (!membership || membership.joinStatus !== 'approved') return false;
  return requiredRoles.includes(membership.role as any);
}

// GET /api/comments?postId=... - Get comments for a post
router.get("/", async (req: any, res) => {
  try {
    const { postId } = req.query;

    if (!postId) {
      return res.status(400).json({ message: "postId is required" });
    }

    // Get post with group info in single query
    const [postWithGroup] = await db
      .select({
        post: posts,
        groupVisibility: groups.visibility,
      })
      .from(posts)
      .innerJoin(groups, eq(posts.groupId, groups.id))
      .where(eq(posts.id, postId));

    // Return 404 for non-existent posts or unauthorized access to private groups
    if (!postWithGroup) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check access for private groups - return 404 to avoid info leakage
    if (postWithGroup.groupVisibility === 'private') {
      if (!req.user?.claims?.sub) {
        return res.status(404).json({ message: "Post not found" });
      }
      const membership = await getUserMembership(req.user.claims.sub, postWithGroup.post.groupId);
      if (!membership || membership.joinStatus !== 'approved') {
        return res.status(404).json({ message: "Post not found" });
      }
    }

    const post = postWithGroup.post;

    // Get comments with author info
    const commentsData = await db
      .select({
        id: groupComments.id,
        postId: groupComments.postId,
        authorId: groupComments.authorId,
        body: groupComments.body,
        parentCommentId: groupComments.parentCommentId,
        isRemoved: groupComments.isRemoved,
        createdAt: groupComments.createdAt,
        editedAt: groupComments.editedAt,
        authorFirstName: users.firstName,
        authorLastName: users.lastName,
        authorPseudonym: groupMemberships.pseudonym,
      })
      .from(groupComments)
      .innerJoin(users, eq(groupComments.authorId, users.id))
      .leftJoin(
        groupMemberships,
        and(
          eq(groupMemberships.userId, groupComments.authorId),
          eq(groupMemberships.groupId, post.groupId)
        )
      )
      .where(
        and(
          eq(groupComments.postId, postId),
          eq(groupComments.isRemoved, false)
        )
      )
      .orderBy(groupComments.createdAt);

    res.json(commentsData);
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ message: "Failed to fetch comments" });
  }
});

// POST /api/comments - Create new comment
router.post("/", commentRateLimit, async (req: any, res) => {
  try {
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;

    // Validate request body
    const parsed = insertGroupCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        message: "Invalid comment data", 
        errors: parsed.error.errors 
      });
    }

    const commentData = parsed.data;

    // Get post to check group membership
    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, commentData.postId));

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check if user is an approved member of the group
    const membership = await getUserMembership(userId, post.groupId);
    if (!membership || membership.joinStatus !== 'approved') {
      return res.status(403).json({ message: "Not a member of this group" });
    }

    // Validate parent comment if provided
    if (commentData.parentCommentId) {
      const [parentComment] = await db
        .select()
        .from(groupComments)
        .where(eq(groupComments.id, commentData.parentCommentId));

      if (!parentComment) {
        return res.status(404).json({ message: "Parent comment not found" });
      }

      // Check threading depth (max 2 levels)
      if (parentComment.parentCommentId) {
        return res.status(400).json({ message: "Comment threading limited to 2 levels" });
      }
    }

    // Create comment
    const [newComment] = await db
      .insert(groupComments)
      .values({
        ...commentData,
        authorId: userId,
      })
      .returning();

    // Increment post comment count
    await db
      .update(posts)
      .set({ commentCount: sql`${posts.commentCount} + 1` })
      .where(eq(posts.id, commentData.postId));

    res.status(201).json(newComment);
  } catch (error) {
    console.error("Error creating comment:", error);
    res.status(500).json({ message: "Failed to create comment" });
  }
});

// PUT /api/comments/:commentId - Edit comment
router.put("/:commentId", async (req: any, res) => {
  try {
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;
    const { commentId } = req.params;

    // Validate request body
    const schema = z.object({
      body: z.string(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        message: "Invalid comment data", 
        errors: parsed.error.errors 
      });
    }

    // Get comment
    const [comment] = await db
      .select()
      .from(groupComments)
      .where(eq(groupComments.id, commentId));

    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // Get post to check group membership
    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, comment.postId));

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check if user is author or moderator
    const isAuthor = comment.authorId === userId;
    const isModerator = await hasPermission(userId, post.groupId, ['owner', 'moderator']);

    if (!isAuthor && !isModerator) {
      return res.status(403).json({ message: "Not authorized to edit this comment" });
    }

    // Update comment
    const [updatedComment] = await db
      .update(groupComments)
      .set({ 
        body: parsed.data.body,
        editedAt: new Date(),
      })
      .where(eq(groupComments.id, commentId))
      .returning();

    res.json(updatedComment);
  } catch (error) {
    console.error("Error editing comment:", error);
    res.status(500).json({ message: "Failed to edit comment" });
  }
});

// DELETE /api/comments/:commentId - Remove comment (soft delete)
router.delete("/:commentId", async (req: any, res) => {
  try {
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;
    const { commentId } = req.params;

    // Get comment
    const [comment] = await db
      .select()
      .from(groupComments)
      .where(eq(groupComments.id, commentId));

    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // Get post to check group membership
    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, comment.postId));

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check if user is author or moderator
    const isAuthor = comment.authorId === userId;
    const isModerator = await hasPermission(userId, post.groupId, ['owner', 'moderator']);

    if (!isAuthor && !isModerator) {
      return res.status(403).json({ message: "Not authorized to remove this comment" });
    }

    // Soft delete
    await db
      .update(groupComments)
      .set({ isRemoved: true })
      .where(eq(groupComments.id, commentId));

    // Decrement post comment count only if not already removed
    if (!comment.isRemoved) {
      await db
        .update(posts)
        .set({ commentCount: sql`${posts.commentCount} - 1` })
        .where(eq(posts.id, comment.postId));
    }

    res.json({ message: "Comment removed successfully" });
  } catch (error) {
    console.error("Error removing comment:", error);
    res.status(500).json({ message: "Failed to remove comment" });
  }
});

// POST /api/comments/:postId/reactions - Toggle reaction on post
router.post("/:postId/reactions", reactionRateLimit, async (req: any, res) => {
  try {
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;
    const { postId } = req.params;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({ message: "emoji is required" });
    }

    // Validate emoji
    const allowedEmojis = ["❤️", "👍", "🙏", "💪", "🎉"];
    if (!allowedEmojis.includes(emoji)) {
      return res.status(400).json({ message: "Invalid emoji" });
    }

    // Get post to check group membership
    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, postId));

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check if user is an approved member of the group
    const membership = await getUserMembership(userId, post.groupId);
    if (!membership || membership.joinStatus !== 'approved') {
      return res.status(403).json({ message: "Not a member of this group" });
    }

    // Check if reaction already exists
    const existingReaction = await db
      .select()
      .from(reactions)
      .where(
        and(
          eq(reactions.postId, postId),
          eq(reactions.userId, userId),
          eq(reactions.emoji, emoji)
        )
      );

    if (existingReaction.length > 0) {
      // Remove reaction
      await db
        .delete(reactions)
        .where(eq(reactions.id, existingReaction[0].id));

      // Decrement reaction count
      await db
        .update(posts)
        .set({ reactionCount: sql`${posts.reactionCount} - 1` })
        .where(eq(posts.id, postId));

      return res.json({ message: "Reaction removed", action: "removed" });
    }

    // Add reaction
    const [newReaction] = await db
      .insert(reactions)
      .values({
        postId,
        userId,
        emoji,
      })
      .returning();

    // Increment reaction count
    await db
      .update(posts)
      .set({ reactionCount: sql`${posts.reactionCount} + 1` })
      .where(eq(posts.id, postId));

    res.status(201).json({ message: "Reaction added", action: "added", reaction: newReaction });
  } catch (error) {
    console.error("Error toggling reaction:", error);
    res.status(500).json({ message: "Failed to toggle reaction" });
  }
});

// GET /api/comments/:postId/reactions - Get reactions for a post
router.get("/:postId/reactions", async (req: any, res) => {
  try {
    const { postId } = req.params;

    // Get post with group info in single query
    const [postWithGroup] = await db
      .select({
        post: posts,
        groupVisibility: groups.visibility,
      })
      .from(posts)
      .innerJoin(groups, eq(posts.groupId, groups.id))
      .where(eq(posts.id, postId));

    // Return 404 for non-existent posts or unauthorized access to private groups
    if (!postWithGroup) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check access for private groups - return 404 to avoid info leakage
    if (postWithGroup.groupVisibility === 'private') {
      if (!req.user?.claims?.sub) {
        return res.status(404).json({ message: "Post not found" });
      }
      const membership = await getUserMembership(req.user.claims.sub, postWithGroup.post.groupId);
      if (!membership || membership.joinStatus !== 'approved') {
        return res.status(404).json({ message: "Post not found" });
      }
    }

    // Get reactions grouped by emoji
    const reactionsData = await db
      .select({
        emoji: reactions.emoji,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(reactions)
      .where(eq(reactions.postId, postId))
      .groupBy(reactions.emoji);

    // Get user's reactions if authenticated
    let userReactions: string[] = [];
    if (req.user?.claims?.sub) {
      const userReactionsData = await db
        .select({ emoji: reactions.emoji })
        .from(reactions)
        .where(
          and(
            eq(reactions.postId, postId),
            eq(reactions.userId, req.user.claims.sub)
          )
        );
      userReactions = userReactionsData.map(r => r.emoji);
    }

    res.json({ reactions: reactionsData, userReactions });
  } catch (error) {
    console.error("Error fetching reactions:", error);
    res.status(500).json({ message: "Failed to fetch reactions" });
  }
});

export default router;
