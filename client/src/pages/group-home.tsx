import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Users,
  Lock,
  Globe,
  Settings,
  MessageSquare,
  Share2,
  BarChart3,
  AlertCircle,
  Edit,
  ChevronDown,
  ChevronUp,
  Flag,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import PostComposer from "@/components/groups/PostComposer";
import { ReactionBar } from "@/components/groups/ReactionBar";

interface Group {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: string;
  kind: string;
  category: string | null;
  memberCount: number;
  postCount: number;
  coverImageUrl: string | null;
  tags: string[];
  userMembership?: {
    id: string;
    role: string;
    joinStatus: string;
    pseudonym: string | null;
  };
}

interface Post {
  id: string;
  groupId: string;
  authorId: string;
  authorPseudonym: string | null;
  body: string;
  kind: string;
  mediaUrl: string | null;
  isPinned: boolean;
  isRemoved: boolean;
  reactionCount: number;
  commentCount: number;
  createdAt: Date;
  editedAt: Date | null;
  poll?: {
    id: string;
    question: string;
    options: { id: string; text: string; voteCount: number }[];
    userVote?: string;
  };
  userReaction?: string;
}

interface Comment {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  parentCommentId: string | null;
  isRemoved: boolean;
  createdAt: string;
  editedAt: string | null;
  authorFirstName: string;
  authorLastName: string;
  authorPseudonym: string | null;
}

export default function GroupHome() {
  const [, params] = useRoute("/groups/:slug");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [pseudonymDialogOpen, setPseudonymDialogOpen] = useState(false);
  const [newPseudonym, setNewPseudonym] = useState("");

  const slug = params?.slug;

  // Fetch group details
  const { data: group, isLoading: groupLoading } = useQuery<Group>({
    queryKey: [`/api/groups/${slug}`],
    enabled: !!slug,
  });

  // Fetch posts
  const { data: posts, isLoading: postsLoading } = useQuery<Post[]>({
    queryKey: [`/api/posts?groupId=${group?.id}`],
    queryFn: async () => {
      if (!group?.id) return [];
      const res = await fetch(`/api/posts?groupId=${group.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch posts");
      return res.json();
    },
    enabled: !!group?.id,
  });

  // Join group mutation
  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!group) return;
      return await apiRequest("POST", `/api/groups/${group.id}/join`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/groups/${slug}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups/my-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups/public"] });
      if (group?.id) {
        queryClient.invalidateQueries({ queryKey: [`/api/posts?groupId=${group.id}`] });
      }
      toast({
        title: "Success",
        description:
          group?.visibility === "private"
            ? "Join request sent! You'll be notified when approved."
            : "You've joined the group!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to join group. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update pseudonym mutation
  const updatePseudonymMutation = useMutation({
    mutationFn: async (pseudonym: string) => {
      if (!group?.userMembership?.id) return;
      return await apiRequest(
        "PATCH",
        `/api/groups/memberships/${group.userMembership.id}`,
        { pseudonym }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/groups/${slug}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups/my-groups"] });
      if (group?.id) {
        queryClient.invalidateQueries({ queryKey: [`/api/posts?groupId=${group.id}`] });
      }
      setPseudonymDialogOpen(false);
      toast({
        title: "Success",
        description: "Pseudonym updated successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update pseudonym. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (groupLoading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <Skeleton className="h-64 w-full mb-8" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="container mx-auto py-16 px-4 max-w-2xl text-center">
        <AlertCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
        <h1 className="text-2xl font-bold mb-2">Group Not Found</h1>
        <p className="text-muted-foreground mb-8">
          This group doesn't exist or you don't have access to it.
        </p>
        <Link href="/groups">
          <Button data-testid="button-back-to-directory">
            Back to Directory
          </Button>
        </Link>
      </div>
    );
  }

  const isApprovedMember = group.userMembership?.joinStatus === "approved";
  const isPendingMember = group.userMembership?.joinStatus === "pending";
  const isModerator =
    isApprovedMember &&
    (group.userMembership?.role === "moderator" ||
      group.userMembership?.role === "owner");

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      {/* Group Header */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <CardTitle className="text-3xl" data-testid="text-group-name">
                  {group.name}
                </CardTitle>
                {group.visibility === "private" ? (
                  <Lock className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <Globe className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <CardDescription data-testid="text-group-description">
                {group.description}
              </CardDescription>
              <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1" data-testid="text-member-count">
                  <Users className="w-4 h-4" />
                  {group.memberCount} members
                </span>
                <span className="flex items-center gap-1" data-testid="text-post-count">
                  <MessageSquare className="w-4 h-4" />
                  {group.postCount} posts
                </span>
                {group.category && (
                  <Badge variant="secondary" data-testid="badge-category">
                    {group.category}
                  </Badge>
                )}
              </div>
              {group.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {group.tags.map((tag) => (
                    <Badge key={tag} variant="outline" data-testid={`badge-tag-${tag}`}>
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {!group.userMembership && (
                <Button
                  onClick={() => joinMutation.mutate()}
                  disabled={joinMutation.isPending}
                  data-testid="button-join-group"
                >
                  {group.visibility === "private" ? "Request to Join" : "Join Group"}
                </Button>
              )}
              {isPendingMember && (
                <Button variant="outline" disabled data-testid="button-pending">
                  Pending Approval
                </Button>
              )}
              {isApprovedMember && (
                <>
                  <Dialog
                    open={pseudonymDialogOpen}
                    onOpenChange={setPseudonymDialogOpen}
                  >
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="button-edit-pseudonym"
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Edit Pseudonym
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit Pseudonym</DialogTitle>
                        <DialogDescription>
                          Your pseudonym is how you'll appear to other group
                          members. This helps protect your privacy.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="pseudonym">Pseudonym</Label>
                          <Input
                            id="pseudonym"
                            value={newPseudonym}
                            onChange={(e) => setNewPseudonym(e.target.value)}
                            placeholder="Enter your pseudonym"
                            data-testid="input-pseudonym"
                          />
                          <p className="text-sm text-muted-foreground mt-2">
                            Current:{" "}
                            {group.userMembership?.pseudonym || "Not set"}
                          </p>
                        </div>
                        <Button
                          onClick={() => updatePseudonymMutation.mutate(newPseudonym)}
                          disabled={
                            !newPseudonym || updatePseudonymMutation.isPending
                          }
                          className="w-full"
                          data-testid="button-save-pseudonym"
                        >
                          Save Pseudonym
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  {isModerator && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation(`/groups/${slug}/settings`)}
                      data-testid="button-group-settings"
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Settings
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Pending membership message */}
      {isPendingMember && (
        <Card className="mb-8 border-amber-500">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              <p className="text-sm" data-testid="text-pending-message">
                Your membership request is pending approval. You'll be able to
                view and participate once a moderator approves your request.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content - Only show if approved member */}
      {isApprovedMember ? (
        <Tabs defaultValue="feed" className="space-y-6">
          <TabsList data-testid="tabs-group-content">
            <TabsTrigger value="feed" data-testid="tab-feed">Feed</TabsTrigger>
            <TabsTrigger value="about" data-testid="tab-about">About</TabsTrigger>
            <TabsTrigger value="members" data-testid="tab-members">
              Members
            </TabsTrigger>
          </TabsList>

          <TabsContent value="feed" className="space-y-6">
            {/* Post Composer */}
            <PostComposer 
              groupId={group.id}
              onPosted={() => {
                queryClient.invalidateQueries({ queryKey: [`/api/posts?groupId=${group.id}`] });
                queryClient.invalidateQueries({ queryKey: [`/api/groups/${slug}`] });
              }}
            />

            {/* Posts Feed */}
            {postsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : posts && posts.length > 0 ? (
              <div className="space-y-4">
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} groupSlug={slug!} groupId={group.id} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-16 text-center">
                  <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No posts yet</h3>
                  <p className="text-muted-foreground">
                    Be the first to start a conversation!
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="about">
            <Card>
              <CardHeader>
                <CardTitle>About this group</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Description</h4>
                  <p className="text-muted-foreground" data-testid="text-about-description">
                    {group.description || "No description provided."}
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Group Type</h4>
                  <Badge>{group.kind}</Badge>
                </div>
                {group.category && (
                  <div>
                    <h4 className="font-semibold mb-2">Category</h4>
                    <Badge variant="secondary">{group.category}</Badge>
                  </div>
                )}
                {group.tags.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Tags</h4>
                    <div className="flex flex-wrap gap-2">
                      {group.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="members">
            <Card>
              <CardHeader>
                <CardTitle>Members ({group.memberCount})</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Member list coming soon...
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : !isPendingMember ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Lock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Join to view content</h3>
            <p className="text-muted-foreground mb-6">
              You need to be a member to see posts and participate in this group.
            </p>
            <Button
              onClick={() => joinMutation.mutate()}
              disabled={joinMutation.isPending}
              data-testid="button-join-to-view"
            >
              {group.visibility === "private" ? "Request to Join" : "Join Group"}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function PostCard({ post, groupSlug, groupId }: { post: Post; groupSlug: string; groupId: string }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportNotes, setReportNotes] = useState("");
  const [reportCommentId, setReportCommentId] = useState<string | null>(null);

  const reportReasons = [
    { value: "spam", label: "Spam or advertising" },
    { value: "harassment", label: "Harassment or bullying" },
    { value: "misinformation", label: "Misinformation or false claims" },
    { value: "inappropriate", label: "Inappropriate content" },
    { value: "off-topic", label: "Off-topic or irrelevant" },
  ];

  // Fetch comments for this post
  const { data: comments } = useQuery<Comment[]>({
    queryKey: [`/api/comments`, post.id],
    queryFn: async () => {
      const res = await fetch(`/api/comments?postId=${post.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: showComments,
  });

  const createCommentMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/comments`, {
        postId: post.id,
        body: commentText,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/comments`, post.id] });
      queryClient.invalidateQueries({ queryKey: [`/api/posts?groupId=${post.groupId}`] });
      setCommentText("");
      toast({
        title: "Success",
        description: "Comment posted successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to post comment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const reportMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/report`, {
        groupId,
        targetType: reportCommentId ? "comment" : "post",
        targetId: reportCommentId || post.id,
        reasonCode: reportReason,
        notes: reportNotes.trim() || undefined,
      });
    },
    onSuccess: () => {
      setReportDialogOpen(false);
      setReportReason("");
      setReportNotes("");
      setReportCommentId(null);
      toast({
        title: "Report submitted",
        description: "Thank you for helping keep our community safe.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit report. Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base font-semibold" data-testid={`text-post-author-${post.id}`}>
              {post.authorPseudonym || "Anonymous"}
            </CardTitle>
            <CardDescription data-testid={`text-post-date-${post.id}`}>
              {new Date(post.createdAt).toLocaleDateString()}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setReportCommentId(null);
              setReportDialogOpen(true);
            }}
            className="h-8 text-muted-foreground hover:text-destructive"
            data-testid={`button-report-post-${post.id}`}
          >
            <Flag className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="whitespace-pre-wrap" data-testid={`text-post-content-${post.id}`}>
          {post.body}
        </p>

        {/* Poll */}
        {post.poll && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{post.poll.question}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {post.poll.options.map((option) => (
                <div
                  key={option.id}
                  className="flex items-center justify-between p-3 border rounded"
                  data-testid={`poll-option-${option.id}`}
                >
                  <span>{option.text}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {option.voteCount} votes
                    </span>
                    {post.poll?.userVote === option.id && (
                      <Badge variant="secondary">Your vote</Badge>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Emoji Reactions */}
        <ReactionBar postId={post.id} groupId={post.groupId} />

        {/* Actions */}
        <div className="flex items-center gap-4 text-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowComments(!showComments)}
            data-testid={`button-toggle-comments-${post.id}`}
          >
            {showComments ? (
              <ChevronUp className="w-4 h-4 mr-1" />
            ) : (
              <ChevronDown className="w-4 h-4 mr-1" />
            )}
            {post.commentCount} {post.commentCount === 1 ? "Comment" : "Comments"}
          </Button>
          <Button variant="ghost" size="sm" data-testid={`button-share-${post.id}`}>
            <Share2 className="w-4 h-4 mr-1" />
            Share
          </Button>
        </div>

        {/* Comments Section */}
        {showComments && (
          <div className="space-y-4 mt-4 border-t pt-4">
            {/* Comment Composer */}
            <div className="space-y-2">
              <Textarea
                placeholder="Write a comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={2}
                data-testid={`textarea-comment-${post.id}`}
              />
              <Button
                onClick={() => createCommentMutation.mutate()}
                disabled={!commentText.trim() || createCommentMutation.isPending}
                size="sm"
                data-testid={`button-submit-comment-${post.id}`}
              >
                {createCommentMutation.isPending ? "Posting..." : "Post Comment"}
              </Button>
            </div>

            {/* Comments List */}
            <div className="space-y-3">
              {comments === undefined ? (
                <div className="text-center text-muted-foreground py-4">
                  Loading comments...
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center text-muted-foreground py-4">
                  No comments yet. Be the first to comment!
                </div>
              ) : (
                comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="border-l-2 border-muted pl-4 space-y-1"
                    data-testid={`comment-${comment.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <span className="font-medium text-sm" data-testid={`text-comment-author-${comment.id}`}>
                          {comment.authorPseudonym || `${comment.authorFirstName} ${comment.authorLastName}`}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {new Date(comment.createdAt).toLocaleDateString()} at{" "}
                          {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setReportCommentId(comment.id);
                          setReportDialogOpen(true);
                        }}
                        className="h-6 px-2 text-muted-foreground hover:text-destructive"
                        data-testid={`button-report-comment-${comment.id}`}
                      >
                        <Flag className="w-3 h-3" />
                      </Button>
                    </div>
                    <p className="text-sm whitespace-pre-wrap" data-testid={`text-comment-body-${comment.id}`}>
                      {comment.body}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </CardContent>

      {/* Report Dialog */}
      <Dialog open={reportDialogOpen} onOpenChange={(open) => {
        setReportDialogOpen(open);
        if (!open) {
          setReportCommentId(null);
          setReportReason("");
          setReportNotes("");
        }
      }}>
        <DialogContent data-testid={`dialog-report-${reportCommentId ? 'comment' : 'post'}-${reportCommentId || post.id}`}>
          <DialogHeader>
            <DialogTitle>Report {reportCommentId ? "Comment" : "Post"}</DialogTitle>
            <DialogDescription>
              Help us keep the community safe by reporting content that violates our guidelines.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <Label>Reason for report</Label>
              <RadioGroup value={reportReason} onValueChange={setReportReason}>
                {reportReasons.map((reason) => (
                  <div key={reason.value} className="flex items-center space-x-2">
                    <RadioGroupItem
                      value={reason.value}
                      id={`reason-${reason.value}-${post.id}`}
                      data-testid={`radio-report-${reason.value}-${post.id}`}
                    />
                    <Label
                      htmlFor={`reason-${reason.value}-${post.id}`}
                      className="font-normal cursor-pointer"
                    >
                      {reason.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-notes">Additional details (optional)</Label>
              <Textarea
                id="report-notes"
                placeholder="Provide any additional context..."
                value={reportNotes}
                onChange={(e) => setReportNotes(e.target.value)}
                rows={3}
                data-testid={`textarea-report-notes-${post.id}`}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setReportDialogOpen(false)}
              data-testid={`button-cancel-report-${post.id}`}
            >
              Cancel
            </Button>
            <Button
              onClick={() => reportMutation.mutate()}
              disabled={!reportReason || reportMutation.isPending}
              variant="destructive"
              data-testid={`button-submit-report-${reportCommentId || post.id}`}
            >
              {reportMutation.isPending ? "Submitting..." : "Submit Report"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
