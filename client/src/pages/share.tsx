import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Lock, 
  Globe, 
  Eye, 
  Calendar, 
  MessageCircle, 
  Heart, 
  User,
  Share2,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  Brain,
  Star
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";

interface SharedContent {
  id: string;
  title: string;
  description?: string;
  contentType: string;
  shareType: string;
  contentSnapshot: Record<string, any>;
  dataSelections: Record<string, any>;
  allowComments: boolean;
  showAuthorInfo: boolean;
  viewCount: number;
  createdAt: string;
  expiresAt?: string;
  lastViewedAt?: string;
  userId: string;
  author?: {
    firstName: string;
    lastName: string;
    profilePicture?: string;
  };
}

interface Comment {
  id: string;
  commentText: string;
  authorName: string;
  isSupport: boolean;
  isQuestion: boolean;
  createdAt: string;
  isApproved: boolean;
}

export default function SharePage() {
  const { id } = useParams<{ id: string }>();
  const [password, setPassword] = useState("");
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [commenterName, setCommenterName] = useState("");
  const [commenterEmail, setCommenterEmail] = useState("");
  const [isSupport, setIsSupport] = useState(false);
  const { toast } = useToast();

  // Fetch shared content
  const { 
    data: sharedContent, 
    isLoading, 
    error,
    refetch 
  } = useQuery<SharedContent>({
    queryKey: [`/api/sharing/public/${id}`],
    queryFn: async () => {
      const url = password 
        ? `/api/sharing/public/${id}?password=${encodeURIComponent(password)}`
        : `/api/sharing/public/${id}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 403 || response.status === 404) {
          // Check if it's a password-protected share
          const errorData = await response.json();
          if (errorData.message?.includes('password') || errorData.message?.includes('Password')) {
            setShowPasswordPrompt(true);
            throw new Error('Password required');
          }
          if (response.status === 404) {
            throw new Error('Shared content not found or no longer available');
          }
          throw new Error(errorData.message || 'Access denied');
        }
        if (response.status === 410) {
          throw new Error('This shared content has expired');
        }
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to load shared content');
      }
      
      return response.json();
    },
    retry: false,
    enabled: !!id,
  });

  // Fetch comments if comments are enabled
  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: [`/api/sharing/comments/${id}`],
    queryFn: async () => {
      const response = await fetch(`/api/sharing/comments/${id}?approved=true`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!sharedContent?.allowComments,
  });

  // Submit password mutation
  const passwordMutation = useMutation({
    mutationFn: async (pwd: string) => {
      const response = await fetch(`/api/sharing/public/${id}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Invalid password. Please try again.');
        }
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to access content');
      }

      return response.json();
    },
    onSuccess: (data: SharedContent) => {
      setPassword(password);
      setShowPasswordPrompt(false);
      
      // Clear the cached error and set the successful data
      queryClient.removeQueries({ queryKey: [`/api/sharing/public/${id}`] });
      queryClient.setQueryData([`/api/sharing/public/${id}`], data);
      
      toast({
        title: "Access granted!",
        description: "Loading your shared content...",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Access denied",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async (commentData: {
      commentText: string;
      authorName: string;
      authorEmail?: string;
      isSupport: boolean;
      isQuestion: boolean;
    }) => {
      const response = await fetch(`/api/sharing/comments/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(commentData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to add comment');
      }

      return response.json();
    },
    onSuccess: () => {
      setNewComment("");
      setCommenterName("");
      setCommenterEmail("");
      setIsSupport(false);
      toast({
        title: "Comment added!",
        description: "Your comment has been submitted and is pending approval.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add comment",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) {
      setPassword(password.trim());
      passwordMutation.mutate(password.trim());
    }
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newComment.trim() && commenterName.trim()) {
      addCommentMutation.mutate({
        commentText: newComment.trim(),
        authorName: commenterName.trim(),
        authorEmail: commenterEmail.trim() || undefined,
        isSupport,
        isQuestion: false,
      });
    }
  };

  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case "symptom_trends": return <TrendingUp className="h-5 w-5" />;
      case "health_summary": return <Heart className="h-5 w-5" />;
      case "ai_insights": return <Brain className="h-5 w-5" />;
      case "product_review": return <Star className="h-5 w-5" />;
      case "achievement": return <CheckCircle className="h-5 w-5" />;
      default: return <Share2 className="h-5 w-5" />;
    }
  };

  const getContentTypeDisplay = (type: string) => {
    switch (type) {
      case "symptom_trends": return "Symptom Trends";
      case "health_summary": return "Health Summary";
      case "ai_insights": return "AI Insights";
      case "product_review": return "Product Review";
      case "achievement": return "Achievement";
      default: return "Shared Content";
    }
  };

  const renderContentSnapshot = (snapshot: Record<string, any>, type: string) => {
    if (!snapshot) return null;

    switch (type) {
      case "symptom_trends":
        return (
          <div className="space-y-4">
            {snapshot.symptoms?.map((symptom: any, index: number) => (
              <Card key={index}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{symptom.name || `Symptom ${index + 1}`}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Average Intensity</span>
                      <Badge variant="outline">{symptom.avgIntensity || 'N/A'}/10</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Logs</span>
                      <Badge variant="secondary">{symptom.totalLogs || 0}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );

      case "ai_insights":
        return (
          <div className="space-y-4">
            {snapshot.insights?.map((insight: any, index: number) => (
              <Card key={index} className="border-l-4 border-l-primary">
                <CardContent className="pt-4">
                  <p className="text-sm leading-relaxed">{insight.text || insight.content}</p>
                  {insight.timestamp && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {format(new Date(insight.timestamp), 'MMM d, yyyy')}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        );

      case "achievement":
        return (
          <Card className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950 dark:to-blue-950">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <CheckCircle className="h-16 w-16 mx-auto text-green-600" />
                <div>
                  <h3 className="text-lg font-semibold">{snapshot.title || "Achievement Unlocked!"}</h3>
                  <p className="text-muted-foreground">{snapshot.description}</p>
                </div>
                {snapshot.date && (
                  <p className="text-sm text-muted-foreground">
                    Achieved on {format(new Date(snapshot.date), 'MMMM d, yyyy')}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );

      default:
        return (
          <Card>
            <CardContent className="pt-4">
              <pre className="text-sm whitespace-pre-wrap overflow-auto">
                {JSON.stringify(snapshot, null, 2)}
              </pre>
            </CardContent>
          </Card>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="text-muted-foreground">Loading shared content...</p>
        </div>
      </div>
    );
  }

  if (showPasswordPrompt) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Lock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <CardTitle>Password Protected</CardTitle>
            <p className="text-sm text-muted-foreground">
              This content is password protected. Please enter the password to view.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <Input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={passwordMutation.isPending}
                data-testid="input-share-password"
              />
              <Button 
                type="submit" 
                className="w-full"
                disabled={passwordMutation.isPending || !password.trim()}
                data-testid="button-submit-password"
              >
                {passwordMutation.isPending ? "Verifying..." : "Access Content"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <CardTitle>Unable to Load Content</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>
                {(error as Error).message}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!sharedContent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <CardTitle>Content Not Found</CardTitle>
            <p className="text-sm text-muted-foreground">
              The shared content you're looking for doesn't exist or is no longer available.
            </p>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary/10 rounded-lg">
              {getContentTypeIcon(sharedContent.contentType)}
            </div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-share-title">
                {sharedContent.title}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="gap-1">
                  {sharedContent.shareType === "public" && <Globe className="h-3 w-3" />}
                  {sharedContent.shareType === "password_protected" && <Lock className="h-3 w-3" />}
                  {sharedContent.shareType === "private" && <Eye className="h-3 w-3" />}
                  {getContentTypeDisplay(sharedContent.contentType)}
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <Eye className="h-3 w-3" />
                  {sharedContent.viewCount} views
                </Badge>
              </div>
            </div>
          </div>

          {sharedContent.description && (
            <p className="text-muted-foreground mb-4">{sharedContent.description}</p>
          )}

          {/* Author info */}
          {sharedContent.showAuthorInfo && sharedContent.author && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <User className="h-8 w-8 p-1 bg-primary/10 rounded-full" />
              <div>
                <p className="font-medium">
                  {sharedContent.author.firstName} {sharedContent.author.lastName}
                </p>
                <p className="text-sm text-muted-foreground">
                  Shared on {format(new Date(sharedContent.createdAt), 'MMMM d, yyyy')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Main content */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {getContentTypeIcon(sharedContent.contentType)}
                Shared {getContentTypeDisplay(sharedContent.contentType)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {renderContentSnapshot(sharedContent.contentSnapshot, sharedContent.contentType)}
            </CardContent>
          </Card>

          {/* Comments section */}
          {sharedContent.allowComments && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  Community Support ({comments.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Existing comments */}
                {comments.length > 0 && (
                  <div className="space-y-4">
                    {comments.map((comment) => (
                      <Card key={comment.id} className="bg-muted/30">
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center">
                                <User className="h-4 w-4" />
                              </div>
                              <span className="font-medium">{comment.authorName}</span>
                              {comment.isSupport && (
                                <Badge variant="default" className="gap-1">
                                  <Heart className="h-3 w-3" />
                                  Support
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(comment.createdAt), 'MMM d, yyyy')}
                            </span>
                          </div>
                          <p className="text-sm leading-relaxed">{comment.commentText}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                <Separator />

                {/* Add comment form */}
                <div>
                  <h4 className="font-medium mb-4">Leave a supportive comment</h4>
                  <form onSubmit={handleCommentSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        placeholder="Your name"
                        value={commenterName}
                        onChange={(e) => setCommenterName(e.target.value)}
                        required
                        data-testid="input-commenter-name"
                      />
                      <Input
                        type="email"
                        placeholder="Email (optional)"
                        value={commenterEmail}
                        onChange={(e) => setCommenterEmail(e.target.value)}
                        data-testid="input-commenter-email"
                      />
                    </div>
                    <Textarea
                      placeholder="Share your thoughts, encouragement, or support..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      rows={3}
                      required
                      data-testid="textarea-comment"
                    />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={isSupport}
                          onChange={(e) => setIsSupport(e.target.checked)}
                          className="rounded"
                          data-testid="checkbox-support"
                        />
                        Mark as supportive comment
                      </label>
                      <Button 
                        type="submit"
                        disabled={addCommentMutation.isPending || !newComment.trim() || !commenterName.trim()}
                        data-testid="button-submit-comment"
                      >
                        {addCommentMutation.isPending ? "Posting..." : "Post Comment"}
                      </Button>
                    </div>
                  </form>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Footer */}
          <div className="text-center py-8 border-t">
            <p className="text-sm text-muted-foreground mb-2">
              Powered by <span className="font-medium text-primary">Zebby's World</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Supporting the EDS community with empathy and understanding
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}