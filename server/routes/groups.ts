import express from "express";
import { db } from "../db";
import { z } from "zod";
import { 
  groups, 
  groupTags, 
  groupMemberships, 
  posts, 
  postPolls,
  postPollOptions,
  postPollVotes,
  groupComments,
  reactions,
  groupBans,
  users,
  insertGroupSchema,
  insertGroupTagSchema,
  insertGroupMembershipSchema,
  type Group,
  type GroupMembership,
  type User
} from "@shared/schema";
import { eq, and, or, sql, desc, inArray } from "drizzle-orm";
import { canAccessGroup } from "../services/groupAccess";

const router = express.Router();

// Helper to set no-store headers for privacy
function setNoStoreHeaders(res: express.Response) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
}

// Helper to generate URL-friendly slugs
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Helper to check if user is banned from a group
async function isUserBanned(userId: string, groupId: string): Promise<boolean> {
  const bans = await db
    .select()
    .from(groupBans)
    .where(
      and(
        eq(groupBans.userId, userId),
        eq(groupBans.groupId, groupId),
        or(
          sql`${groupBans.expiresAt} IS NULL`,
          sql`${groupBans.expiresAt} > NOW()`
        )
      )
    );
  return bans.length > 0;
}

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

// GET /api/groups/public - Get all public groups with tags and eligibility info
router.get("/public", async (req: any, res) => {
  try {
    setNoStoreHeaders(res);
    // Get all public groups
    const publicGroups = await db
      .select({
        id: groups.id,
        slug: groups.slug,
        name: groups.name,
        description: groups.description,
        visibility: groups.visibility,
        kind: groups.kind,
        memberCount: groups.memberCount,
        postCount: groups.postCount,
        coverImageUrl: groups.coverImageUrl,
        createdAt: groups.createdAt,
      })
      .from(groups)
      .where(eq(groups.visibility, 'public'))
      .orderBy(desc(groups.memberCount));

    // Get tags for all groups
    const allTags = await db
      .select()
      .from(groupTags)
      .where(inArray(groupTags.groupId, publicGroups.map(g => g.id)));

    // Group tags by groupId
    const tagsByGroup = new Map<string, string[]>();
    for (const tag of allTags) {
      if (!tagsByGroup.has(tag.groupId)) {
        tagsByGroup.set(tag.groupId, []);
      }
      tagsByGroup.get(tag.groupId)!.push(tag.tag);
    }

    // Check eligibility for authenticated users
    let userProfile: User | undefined;
    if (req.user?.claims?.sub) {
      const [profile] = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user.claims.sub));
      userProfile = profile;
    }

    // Add tags and eligibility to groups
    const groupsWithTags = publicGroups.map(group => {
      const groupTags = tagsByGroup.get(group.id) || [];
      let eligibility: { canAccess: boolean; reason?: string } = {
        canAccess: true,
      };

      // Check eligibility only for groups with access-control tags and authenticated users
      if (userProfile && groupTags.length > 0) {
        // Public groups don't require access checks per the join logic,
        // but we still want to show hints if user wouldn't meet private group criteria
        const accessControlTags = groupTags.filter(t => {
          const tagLower = t.toLowerCase();
          return (
            tagLower.startsWith('age-') || // Age ranges
            ['women', 'men'].includes(tagLower) || // Gender
            ['lgbtq', 'transgender', 'non-binary', 'queer'].includes(tagLower) || // Identity
            ['heds', 'pots', 'mcas', 'veds', 'ceds'].includes(tagLower) // Diagnosis
          );
        });
        if (accessControlTags.length > 0) {
          // Create a minimal group object that matches the Group type
          const groupForCheck: Group = {
            ...group,
            rules: null,
            createdBy: '', // Not needed for access check
            updatedAt: null,
          };
          eligibility = canAccessGroup(userProfile, groupForCheck, groupTags);
        }
      }

      return {
        ...group,
        tags: groupTags,
        eligibility,
      };
    });

    res.json(groupsWithTags);
  } catch (error) {
    console.error("Error fetching public groups:", error);
    res.status(500).json({ message: "Failed to fetch public groups" });
  }
});

// GET /api/groups/my-groups - Get user's groups (authenticated)
router.get("/my-groups", async (req: any, res) => {
  try {
    setNoStoreHeaders(res);
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;

    // Get user's memberships
    const memberships = await db
      .select({
        id: groupMemberships.id,
        groupId: groupMemberships.groupId,
        role: groupMemberships.role,
        joinStatus: groupMemberships.joinStatus,
        pseudonym: groupMemberships.pseudonym,
        joinedAt: groupMemberships.createdAt,
        groupName: groups.name,
        groupSlug: groups.slug,
        groupDescription: groups.description,
        groupVisibility: groups.visibility,
        groupKind: groups.kind,
        groupMemberCount: groups.memberCount,
        groupPostCount: groups.postCount,
        groupCoverImageUrl: groups.coverImageUrl,
      })
      .from(groupMemberships)
      .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
      .where(eq(groupMemberships.userId, userId))
      .orderBy(desc(groupMemberships.createdAt));

    // Format response
    const myGroups = memberships.map(m => ({
      id: m.groupId,
      slug: m.groupSlug,
      name: m.groupName,
      description: m.groupDescription,
      visibility: m.groupVisibility,
      kind: m.groupKind,
      memberCount: m.groupMemberCount,
      postCount: m.groupPostCount,
      coverImageUrl: m.groupCoverImageUrl,
      membership: {
        id: m.id,
        role: m.role,
        joinStatus: m.joinStatus,
        pseudonym: m.pseudonym,
        joinedAt: m.joinedAt,
      },
    }));

    res.json(myGroups);
  } catch (error) {
    console.error("Error fetching user's groups:", error);
    res.status(500).json({ message: "Failed to fetch user's groups" });
  }
});

// GET /api/groups - List all groups (with filtering)
router.get("/", async (req: any, res) => {
  try {
    setNoStoreHeaders(res);
    const { kind, visibility, userId } = req.query;
    
    // Build conditions
    const conditions = [];
    if (kind) conditions.push(eq(groups.kind, kind));
    if (visibility) conditions.push(eq(groups.visibility, visibility));

    // Build query with conditions
    const result = await db
      .select({
        id: groups.id,
        slug: groups.slug,
        name: groups.name,
        visibility: groups.visibility,
        kind: groups.kind,
        description: groups.description,
        coverImageUrl: groups.coverImageUrl,
        memberCount: groups.memberCount,
        postCount: groups.postCount,
        createdAt: groups.createdAt,
      })
      .from(groups)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(groups.memberCount));

    // If userId is provided, enrich with user's membership status
    if (userId && req.user?.claims?.sub === userId) {
      const memberships = await db
        .select()
        .from(groupMemberships)
        .where(eq(groupMemberships.userId, userId));
      
      const membershipMap = new Map(
        memberships.map(m => [m.groupId, m])
      );

      const enrichedGroups = result.map(group => ({
        ...group,
        userMembership: membershipMap.get(group.id) || null,
      }));

      return res.json(enrichedGroups);
    }

    res.json(result);
  } catch (error) {
    console.error("Error fetching groups:", error);
    res.status(500).json({ message: "Failed to fetch groups" });
  }
});

// GET /api/groups/:slug - Get single group by slug
router.get("/:slug", async (req: any, res) => {
  try {
    setNoStoreHeaders(res);
    const { slug } = req.params;
    
    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.slug, slug));

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Get group tags
    const tags = await db
      .select()
      .from(groupTags)
      .where(eq(groupTags.groupId, group.id));

    // If user is authenticated, get their membership
    let userMembership = null;
    if (req.user?.claims?.sub) {
      userMembership = await getUserMembership(req.user.claims.sub, group.id);
    }

    res.json({
      ...group,
      tags: tags.map(t => t.tag),
      userMembership,
    });
  } catch (error) {
    console.error("Error fetching group:", error);
    res.status(500).json({ message: "Failed to fetch group" });
  }
});

// POST /api/groups - Create new group (authenticated users only)
router.post("/", async (req: any, res) => {
  try {
    setNoStoreHeaders(res);
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;

    // Validate request body
    const schema = insertGroupSchema.extend({
      tags: z.array(z.string()).optional(),
    }).omit({ slug: true });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        message: "Invalid group data", 
        errors: parsed.error.errors 
      });
    }

    const { tags, ...groupData } = parsed.data;
    
    // Generate unique slug
    let slug = generateSlug(groupData.name);
    const existingGroup = await db
      .select()
      .from(groups)
      .where(eq(groups.slug, slug));
    
    if (existingGroup.length > 0) {
      // Add random suffix if slug exists
      slug = `${slug}-${Math.random().toString(36).substring(2, 8)}`;
    }

    // Create group
    const [newGroup] = await db
      .insert(groups)
      .values({
        ...groupData,
        slug,
        createdBy: userId,
        memberCount: 1,
        postCount: 0,
      })
      .returning();

    // Add creator as owner
    await db
      .insert(groupMemberships)
      .values({
        groupId: newGroup.id,
        userId,
        role: "owner",
        joinStatus: "approved",
      });

    // Add tags if provided
    if (tags && tags.length > 0) {
      await db
        .insert(groupTags)
        .values(
          tags.map(tag => ({
            groupId: newGroup.id,
            tag,
          }))
        );
    }

    res.status(201).json(newGroup);
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).json({ message: "Failed to create group" });
  }
});

// POST /api/groups/:groupId/join - Request to join a group
router.post("/:groupId/join", async (req: any, res) => {
  try {
    setNoStoreHeaders(res);
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;
    const { groupId } = req.params;
    const { pseudonym } = req.body;

    // Check if group exists
    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId));

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Check if user is banned
    if (await isUserBanned(userId, groupId)) {
      return res.status(403).json({ message: "You are banned from this group" });
    }

    // Check access control only for private/gated groups
    // Public groups are open to all (no access checks needed)
    if (group.visibility !== 'public') {
      // Load user profile
      const [userProfile] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));
      
      if (!userProfile) {
        return res.status(404).json({ message: "User profile not found" });
      }

      // Load group tags
      const groupTagRecords = await db
        .select()
        .from(groupTags)
        .where(eq(groupTags.groupId, groupId));
      
      const tags = groupTagRecords.map(t => t.tag);

      // Check access
      const accessCheck = await canAccessGroup(userProfile, group, tags);
      if (!accessCheck.canAccess) {
        return res.status(403).json({ 
          message: accessCheck.reason || "You don't meet the requirements to join this group" 
        });
      }
    }

    // Check if user is already a member
    const existing = await getUserMembership(userId, groupId);
    if (existing) {
      return res.status(400).json({ 
        message: "Already a member or pending approval",
        membership: existing 
      });
    }

    // Create membership
    const [membership] = await db
      .insert(groupMemberships)
      .values({
        groupId,
        userId,
        role: "member",
        joinStatus: group.visibility === "public" ? "approved" : "pending",
        pseudonym: pseudonym || null,
      })
      .returning();

    // Update member count if auto-approved
    if (membership.joinStatus === "approved") {
      await db
        .update(groups)
        .set({ memberCount: sql`${groups.memberCount} + 1` })
        .where(eq(groups.id, groupId));
    }

    res.status(201).json(membership);
  } catch (error) {
    console.error("Error joining group:", error);
    res.status(500).json({ message: "Failed to join group" });
  }
});

// PUT /api/groups/:groupId/members/:userId/approve - Approve membership (moderator+)
router.put("/:groupId/members/:userId/approve", async (req: any, res) => {
  try {
    setNoStoreHeaders(res);
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const currentUserId = req.user.claims.sub;
    const { groupId, userId } = req.params;

    // Check if current user has permission
    if (!await hasPermission(currentUserId, groupId, ['owner', 'moderator'])) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    // Update membership only if currently pending (prevents race conditions)
    const updatedRows = await db
      .update(groupMemberships)
      .set({ 
        joinStatus: "approved",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(groupMemberships.groupId, groupId),
          eq(groupMemberships.userId, userId),
          eq(groupMemberships.joinStatus, "pending") // Only update if pending
        )
      )
      .returning();

    if (updatedRows.length === 0) {
      // Either membership doesn't exist or already approved
      const existingMembership = await getUserMembership(userId, groupId);
      if (!existingMembership) {
        return res.status(404).json({ message: "Membership not found" });
      }
      return res.status(400).json({ message: "Member already approved" });
    }

    const [membership] = updatedRows;

    // Increment member count only if we actually updated a row (transitioned from pending to approved)
    await db
      .update(groups)
      .set({ memberCount: sql`${groups.memberCount} + 1` })
      .where(eq(groups.id, groupId));

    res.json(membership);
  } catch (error) {
    console.error("Error approving membership:", error);
    res.status(500).json({ message: "Failed to approve membership" });
  }
});

// PUT /api/groups/:groupId/pseudonym - Update user's pseudonym in a group
router.put("/:groupId/pseudonym", async (req: any, res) => {
  try {
    setNoStoreHeaders(res);
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;
    const { groupId } = req.params;
    const { pseudonym } = req.body;

    // Validate pseudonym
    const schema = z.object({
      pseudonym: z.string().min(1).max(50).nullable(),
    });

    const parsed = schema.safeParse({ pseudonym });
    if (!parsed.success) {
      return res.status(400).json({ 
        message: "Invalid pseudonym", 
        errors: parsed.error.errors 
      });
    }

    // Check if user is member
    const membership = await getUserMembership(userId, groupId);
    if (!membership || membership.joinStatus !== 'approved') {
      return res.status(403).json({ message: "Not a member of this group" });
    }

    // Update pseudonym
    const [updated] = await db
      .update(groupMemberships)
      .set({ 
        pseudonym: parsed.data.pseudonym,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(groupMemberships.groupId, groupId),
          eq(groupMemberships.userId, userId)
        )
      )
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Error updating pseudonym:", error);
    res.status(500).json({ message: "Failed to update pseudonym" });
  }
});

// GET /api/groups/:groupId/members - Get group members (members only)
router.get("/:groupId/members", async (req: any, res) => {
  try {
    setNoStoreHeaders(res);
    const { groupId } = req.params;
    const { status } = req.query;

    // Check if group exists
    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId));

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // If private group, require authentication and membership
    if (group.visibility === 'private') {
      if (!req.user?.claims?.sub) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const membership = await getUserMembership(req.user.claims.sub, groupId);
      if (!membership || membership.joinStatus !== 'approved') {
        return res.status(403).json({ message: "Not a member of this group" });
      }
    }

    // Build query with optional status filter
    const whereConditions = status 
      ? and(
          eq(groupMemberships.groupId, groupId),
          eq(groupMemberships.joinStatus, status)
        )
      : eq(groupMemberships.groupId, groupId);

    const members = await db
      .select({
        id: groupMemberships.id,
        userId: groupMemberships.userId,
        role: groupMemberships.role,
        joinStatus: groupMemberships.joinStatus,
        pseudonym: groupMemberships.pseudonym,
        createdAt: groupMemberships.createdAt,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(groupMemberships)
      .innerJoin(users, eq(groupMemberships.userId, users.id))
      .where(whereConditions)
      .orderBy(desc(groupMemberships.createdAt));

    res.json(members);
  } catch (error) {
    console.error("Error fetching members:", error);
    res.status(500).json({ message: "Failed to fetch members" });
  }
});

// DELETE /api/groups/:groupId/members/:userId - Remove member (moderator+)
router.delete("/:groupId/members/:userId", async (req: any, res) => {
  try {
    setNoStoreHeaders(res);
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const currentUserId = req.user.claims.sub;
    const { groupId, userId } = req.params;

    // Check if current user has permission (or is leaving themselves)
    const isSelf = currentUserId === userId;
    if (!isSelf && !await hasPermission(currentUserId, groupId, ['owner', 'moderator'])) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    // Delete only approved memberships (prevents race conditions with counter)
    const deletedRows = await db
      .delete(groupMemberships)
      .where(
        and(
          eq(groupMemberships.groupId, groupId),
          eq(groupMemberships.userId, userId),
          eq(groupMemberships.joinStatus, "approved") // Only delete approved members
        )
      )
      .returning();

    // If no rows deleted, check if membership exists but isn't approved
    if (deletedRows.length === 0) {
      const membership = await getUserMembership(userId, groupId);
      if (!membership) {
        return res.status(404).json({ message: "Membership not found" });
      }
      // If pending, delete it without affecting counter
      await db
        .delete(groupMemberships)
        .where(
          and(
            eq(groupMemberships.groupId, groupId),
            eq(groupMemberships.userId, userId)
          )
        );
      return res.json({ message: "Member removed successfully" });
    }

    // Decrement member count only if we actually deleted an approved member
    await db
      .update(groups)
      .set({ memberCount: sql`${groups.memberCount} - 1` })
      .where(eq(groups.id, groupId));

    res.json({ message: "Member removed successfully" });
  } catch (error) {
    console.error("Error removing member:", error);
    res.status(500).json({ message: "Failed to remove member" });
  }
});

export default router;
