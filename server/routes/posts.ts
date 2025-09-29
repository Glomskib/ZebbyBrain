import express from "express";
import { db } from "../db";
import { z } from "zod";
import { 
  posts,
  postPolls,
  postPollOptions,
  postPollVotes,
  groupComments,
  reactions,
  groupMemberships,
  groups,
  users,
  insertPostSchema,
  insertPostPollSchema,
  insertPostPollOptionSchema,
  insertGroupCommentSchema,
  insertReactionSchema,
  type Post,
  type GroupMembership
} from "@shared/schema";
import { eq, and, sql, desc, asc, inArray } from "drizzle-orm";

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

// GET /api/posts?groupId=... - Get posts for a group
router.get("/", async (req: any, res) => {
  try {
    const { groupId } = req.query;

    if (!groupId) {
      return res.status(400).json({ message: "groupId is required" });
    }

    // Check if group exists
    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId));

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Check access for private groups
    if (group.visibility === 'private') {
      if (!req.user?.claims?.sub) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const membership = await getUserMembership(req.user.claims.sub, groupId);
      if (!membership || membership.joinStatus !== 'approved') {
        return res.status(403).json({ message: "Not a member of this group" });
      }
    }

    // Get posts with author info
    const postsData = await db
      .select({
        id: posts.id,
        groupId: posts.groupId,
        authorId: posts.authorId,
        body: posts.body,
        kind: posts.kind,
        mediaUrl: posts.mediaUrl,
        isPinned: posts.isPinned,
        isRemoved: posts.isRemoved,
        reactionCount: posts.reactionCount,
        commentCount: posts.commentCount,
        createdAt: posts.createdAt,
        editedAt: posts.editedAt,
        authorFirstName: users.firstName,
        authorLastName: users.lastName,
        authorPseudonym: groupMemberships.pseudonym,
      })
      .from(posts)
      .innerJoin(users, eq(posts.authorId, users.id))
      .leftJoin(
        groupMemberships,
        and(
          eq(groupMemberships.userId, posts.authorId),
          eq(groupMemberships.groupId, posts.groupId)
        )
      )
      .where(
        and(
          eq(posts.groupId, groupId),
          eq(posts.isRemoved, false)
        )
      )
      .orderBy(desc(posts.isPinned), desc(posts.createdAt));

    res.json(postsData);
  } catch (error) {
    console.error("Error fetching posts:", error);
    res.status(500).json({ message: "Failed to fetch posts" });
  }
});

// GET /api/posts/:postId - Get single post with details
router.get("/:postId", async (req: any, res) => {
  try {
    const { postId } = req.params;

    // Get post with author info
    const [postData] = await db
      .select({
        id: posts.id,
        groupId: posts.groupId,
        authorId: posts.authorId,
        body: posts.body,
        kind: posts.kind,
        mediaUrl: posts.mediaUrl,
        isPinned: posts.isPinned,
        isRemoved: posts.isRemoved,
        reactionCount: posts.reactionCount,
        commentCount: posts.commentCount,
        createdAt: posts.createdAt,
        editedAt: posts.editedAt,
        authorFirstName: users.firstName,
        authorLastName: users.lastName,
        authorPseudonym: groupMemberships.pseudonym,
      })
      .from(posts)
      .innerJoin(users, eq(posts.authorId, users.id))
      .leftJoin(
        groupMemberships,
        and(
          eq(groupMemberships.userId, posts.authorId),
          eq(groupMemberships.groupId, posts.groupId)
        )
      )
      .where(eq(posts.id, postId));

    if (!postData) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check access for private groups
    const [group] = await db.select().from(groups).where(eq(groups.id, postData.groupId));
    if (group && group.visibility === 'private') {
      if (!req.user?.claims?.sub) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const membership = await getUserMembership(req.user.claims.sub, postData.groupId);
      if (!membership || membership.joinStatus !== 'approved') {
        return res.status(403).json({ message: "Not a member of this group" });
      }
    }

    // If poll, get poll data
    let poll = null;
    if (postData.kind === 'poll') {
      const [pollData] = await db
        .select()
        .from(postPolls)
        .where(eq(postPolls.postId, postId));

      if (pollData) {
        const options = await db
          .select()
          .from(postPollOptions)
          .where(eq(postPollOptions.postId, postId));

        poll = {
          ...pollData,
          options,
        };
      }
    }

    res.json({
      ...postData,
      poll,
    });
  } catch (error) {
    console.error("Error fetching post:", error);
    res.status(500).json({ message: "Failed to fetch post" });
  }
});

// POST /api/posts - Create new post
router.post("/", async (req: any, res) => {
  try {
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;

    // Validate request body
    const schema = insertPostSchema.extend({
      poll: z.object({
        question: z.string(),
        options: z.array(z.string()).min(2).max(10),
        closesAt: z.string().datetime().optional(),
      }).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        message: "Invalid post data", 
        errors: parsed.error.errors 
      });
    }

    const { poll, ...postData } = parsed.data;

    // Check if user is an approved member of the group
    const membership = await getUserMembership(userId, postData.groupId);
    if (!membership || membership.joinStatus !== 'approved') {
      return res.status(403).json({ message: "Not a member of this group" });
    }

    // Create post
    const [newPost] = await db
      .insert(posts)
      .values({
        ...postData,
        authorId: userId,
        reactionCount: 0,
        commentCount: 0,
      })
      .returning();

    // Create poll if provided
    if (poll && postData.kind === 'poll') {
      const [newPoll] = await db
        .insert(postPolls)
        .values({
          postId: newPost.id,
          question: poll.question,
          closesAt: poll.closesAt ? new Date(poll.closesAt) : null,
          totalVotes: 0,
        })
        .returning();

      // Create poll options
      await db
        .insert(postPollOptions)
        .values(
          poll.options.map(optionText => ({
            postId: newPost.id,
            optionText,
            votes: 0,
          }))
        );
    }

    // Increment group post count
    await db
      .update(groups)
      .set({ postCount: sql`${groups.postCount} + 1` })
      .where(eq(groups.id, postData.groupId));

    res.status(201).json(newPost);
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).json({ message: "Failed to create post" });
  }
});

// PUT /api/posts/:postId - Edit post
router.put("/:postId", async (req: any, res) => {
  try {
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;
    const { postId } = req.params;

    // Validate request body
    const schema = z.object({
      body: z.string(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        message: "Invalid post data", 
        errors: parsed.error.errors 
      });
    }

    // Get post
    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, postId));

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check if user is author or moderator
    const isAuthor = post.authorId === userId;
    const isModerator = await hasPermission(userId, post.groupId, ['owner', 'moderator']);

    if (!isAuthor && !isModerator) {
      return res.status(403).json({ message: "Not authorized to edit this post" });
    }

    // Update post
    const [updatedPost] = await db
      .update(posts)
      .set({ 
        body: parsed.data.body,
        editedAt: new Date(),
      })
      .where(eq(posts.id, postId))
      .returning();

    res.json(updatedPost);
  } catch (error) {
    console.error("Error editing post:", error);
    res.status(500).json({ message: "Failed to edit post" });
  }
});

// DELETE /api/posts/:postId - Remove post (soft delete)
router.delete("/:postId", async (req: any, res) => {
  try {
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;
    const { postId } = req.params;

    // Get post
    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, postId));

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check if user is author or moderator
    const isAuthor = post.authorId === userId;
    const isModerator = await hasPermission(userId, post.groupId, ['owner', 'moderator']);

    if (!isAuthor && !isModerator) {
      return res.status(403).json({ message: "Not authorized to remove this post" });
    }

    // Soft delete
    await db
      .update(posts)
      .set({ isRemoved: true })
      .where(eq(posts.id, postId));

    // Decrement group post count only if not already removed
    if (!post.isRemoved) {
      await db
        .update(groups)
        .set({ postCount: sql`${groups.postCount} - 1` })
        .where(eq(groups.id, post.groupId));
    }

    res.json({ message: "Post removed successfully" });
  } catch (error) {
    console.error("Error removing post:", error);
    res.status(500).json({ message: "Failed to remove post" });
  }
});

// PUT /api/posts/:postId/pin - Toggle post pin (moderator+)
router.put("/:postId/pin", async (req: any, res) => {
  try {
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;
    const { postId } = req.params;

    // Get post
    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, postId));

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check if user is moderator
    if (!await hasPermission(userId, post.groupId, ['owner', 'moderator'])) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    // Toggle pin
    const [updatedPost] = await db
      .update(posts)
      .set({ isPinned: !post.isPinned })
      .where(eq(posts.id, postId))
      .returning();

    res.json(updatedPost);
  } catch (error) {
    console.error("Error toggling pin:", error);
    res.status(500).json({ message: "Failed to toggle pin" });
  }
});

// POST /api/posts/:postId/poll/vote - Vote on poll
router.post("/:postId/poll/vote", async (req: any, res) => {
  try {
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;
    const { postId } = req.params;
    const { optionId } = req.body;

    if (!optionId) {
      return res.status(400).json({ message: "optionId is required" });
    }

    // Get post
    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, postId));

    if (!post || post.kind !== 'poll') {
      return res.status(404).json({ message: "Poll not found" });
    }

    // Check if user is member
    const membership = await getUserMembership(userId, post.groupId);
    if (!membership || membership.joinStatus !== 'approved') {
      return res.status(403).json({ message: "Not a member of this group" });
    }

    // Check if poll is closed
    const [poll] = await db
      .select()
      .from(postPolls)
      .where(eq(postPolls.postId, postId));

    if (poll && poll.closesAt && new Date(poll.closesAt) < new Date()) {
      return res.status(400).json({ message: "Poll is closed" });
    }

    // Check if user already voted
    const existingVote = await db
      .select()
      .from(postPollVotes)
      .where(
        and(
          eq(postPollVotes.userId, userId),
          eq(postPollVotes.postId, postId)
        )
      );

    if (existingVote.length > 0) {
      // Remove old vote
      const [oldVote] = existingVote;
      await db
        .delete(postPollVotes)
        .where(eq(postPollVotes.id, oldVote.id));

      // Decrement old option
      await db
        .update(postPollOptions)
        .set({ votes: sql`${postPollOptions.votes} - 1` })
        .where(eq(postPollOptions.id, oldVote.optionId));
    }

    // Add new vote
    await db
      .insert(postPollVotes)
      .values({
        postId,
        optionId,
        userId,
      });

    // Increment new option
    await db
      .update(postPollOptions)
      .set({ votes: sql`${postPollOptions.votes} + 1` })
      .where(eq(postPollOptions.id, optionId));

    // Update total votes
    await db
      .update(postPolls)
      .set({ totalVotes: sql`${postPolls.totalVotes} + ${existingVote.length > 0 ? 0 : 1}` })
      .where(eq(postPolls.postId, postId));

    res.json({ message: "Vote recorded successfully" });
  } catch (error) {
    console.error("Error voting on poll:", error);
    res.status(500).json({ message: "Failed to vote on poll" });
  }
});

export default router;
