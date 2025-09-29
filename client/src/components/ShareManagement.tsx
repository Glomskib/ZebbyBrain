import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { 
  Share2, 
  Copy, 
  Eye, 
  Globe, 
  Lock, 
  MoreHorizontal, 
  Trash2, 
  ExternalLink,
  Calendar,
  MessageCircle,
  BarChart3,
  Settings
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
  isActive: boolean;
  viewCount: number;
  allowComments: boolean;
  showAuthorInfo: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  lastViewedAt?: string;
}

interface ShareAnalytics {
  totalViews: number;
  uniqueViewers: number;
  countries: string[];
}

export default function ShareManagement() {
  const [selectedShare, setSelectedShare] = useState<SharedContent | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [shareAnalytics, setShareAnalytics] = useState<ShareAnalytics | null>(null);
  const { toast } = useToast();

  // Fetch user's shared content
  const { data: shares = [], isLoading, refetch } = useQuery<SharedContent[]>({
    queryKey: ['/api/sharing/content'],
    retry: false,
  });

  // Delete share mutation
  const deleteShareMutation = useMutation({
    mutationFn: async (shareId: string) => {
      const response = await fetch(`/api/sharing/content/${shareId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete share');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Share deleted",
        description: "Your shared content has been removed successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/sharing/content'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete share",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Fetch analytics mutation
  const fetchAnalyticsMutation = useMutation({
    mutationFn: async (shareId: string) => {
      const response = await fetch(`/api/sharing/analytics/${shareId}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch analytics');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setShareAnalytics(data.summary);
      setAnalyticsOpen(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to fetch analytics",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const copyShareUrl = async (shareId: string) => {
    const shareUrl = `${window.location.origin}/share/${shareId}`;
    await navigator.clipboard.writeText(shareUrl);
    toast({
      title: "Link copied!",
      description: "Share link has been copied to your clipboard.",
    });
  };

  const openShare = (shareId: string) => {
    const shareUrl = `${window.location.origin}/share/${shareId}`;
    window.open(shareUrl, '_blank');
  };

  const getShareTypeIcon = (type: string) => {
    switch (type) {
      case "public": return <Globe className="h-4 w-4" />;
      case "password_protected": return <Lock className="h-4 w-4" />;
      case "private": return <Eye className="h-4 w-4" />;
      default: return <Share2 className="h-4 w-4" />;
    }
  };

  const getContentTypeDisplay = (type: string) => {
    switch (type) {
      case "symptom_trends": return "Symptom Trends";
      case "health_summary": return "Health Summary";
      case "ai_insights": return "AI Insights";
      case "product_review": return "Product Review";
      case "achievement": return "Achievement";
      default: return "Custom Content";
    }
  };

  const isExpired = (expiresAt?: string) => {
    return expiresAt ? new Date() > new Date(expiresAt) : false;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Your Shared Content
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Loading your shares...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Your Shared Content
          </CardTitle>
          <Badge variant="outline">{shares.length} shares</Badge>
        </CardHeader>
        <CardContent>
          {shares.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Share2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No shared content yet</p>
              <p className="text-sm">
                Share your health insights and achievements with others to inspire and connect.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {shares.map((share) => (
                <Card key={share.id} className={`${isExpired(share.expiresAt) ? 'opacity-60' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          {getShareTypeIcon(share.shareType)}
                          <h3 className="font-medium truncate" data-testid={`text-share-title-${share.id}`}>
                            {share.title}
                          </h3>
                          <Badge variant="secondary" className="text-xs">
                            {getContentTypeDisplay(share.contentType)}
                          </Badge>
                          {isExpired(share.expiresAt) && (
                            <Badge variant="destructive" className="text-xs">
                              Expired
                            </Badge>
                          )}
                          {!share.isActive && (
                            <Badge variant="outline" className="text-xs">
                              Inactive
                            </Badge>
                          )}
                        </div>
                        
                        {share.description && (
                          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                            {share.description}
                          </p>
                        )}
                        
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {share.viewCount} views
                          </div>
                          {share.allowComments && (
                            <div className="flex items-center gap-1">
                              <MessageCircle className="h-3 w-3" />
                              Comments enabled
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(share.createdAt), 'MMM d, yyyy')}
                          </div>
                          {share.expiresAt && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Expires {format(new Date(share.expiresAt), 'MMM d')}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyShareUrl(share.id)}
                          data-testid={`button-copy-${share.id}`}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" data-testid={`button-menu-${share.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              onClick={() => openShare(share.id)}
                              data-testid={`menu-open-${share.id}`}
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Open Share
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => copyShareUrl(share.id)}
                              data-testid={`menu-copy-${share.id}`}
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Copy Link
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedShare(share);
                                fetchAnalyticsMutation.mutate(share.id);
                              }}
                              data-testid={`menu-analytics-${share.id}`}
                            >
                              <BarChart3 className="h-4 w-4 mr-2" />
                              View Analytics
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => deleteShareMutation.mutate(share.id)}
                              className="text-destructive"
                              data-testid={`menu-delete-${share.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Share
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analytics Dialog */}
      <Dialog open={analyticsOpen} onOpenChange={setAnalyticsOpen}>
        <DialogContent data-testid="dialog-analytics">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Share Analytics
              {selectedShare && (
                <Badge variant="outline">{selectedShare.title}</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {shareAnalytics && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold" data-testid="text-total-views">
                      {shareAnalytics.totalViews}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Views</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold" data-testid="text-unique-viewers">
                      {shareAnalytics.uniqueViewers}
                    </div>
                    <div className="text-sm text-muted-foreground">Unique Viewers</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold" data-testid="text-countries-count">
                      {shareAnalytics.countries.length}
                    </div>
                    <div className="text-sm text-muted-foreground">Countries</div>
                  </CardContent>
                </Card>
              </div>
              
              {shareAnalytics.countries.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Countries</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {shareAnalytics.countries.map((country) => (
                        <Badge key={country} variant="secondary">
                          {country}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}