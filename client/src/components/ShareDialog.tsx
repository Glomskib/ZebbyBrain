import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Share2, 
  Copy, 
  Facebook, 
  Twitter, 
  Mail, 
  MessageCircle,
  LinkIcon,
  Lock,
  Globe,
  Eye,
  Calendar,
  Settings
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

// Zod schema for share form validation
const shareFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  shareType: z.enum(["public", "password_protected", "private"]).default("public"),
  sharePassword: z.string().optional(),
  expiresAt: z.string().optional(),
  allowComments: z.boolean().default(false),
  showAuthorInfo: z.boolean().default(true),
}).superRefine((data, ctx) => {
  // Require password for password-protected shares
  if (data.shareType === "password_protected" && (!data.sharePassword || data.sharePassword.trim() === "")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Password is required for password-protected shares",
      path: ["sharePassword"]
    });
  }
});

type ShareFormData = z.infer<typeof shareFormSchema>;

interface ShareDialogProps {
  contentType: "symptom_trends" | "health_summary" | "ai_insights" | "product_review" | "achievement" | "custom";
  contentData: Record<string, any>;
  contentSnapshot: Record<string, any>;
  dateRangeStart?: Date;
  dateRangeEnd?: Date;
  trigger?: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface SharedContent {
  id: string;
  title: string;
  shareType: string;
  isActive: boolean;
  viewCount: number;
  createdAt: string;
  expiresAt?: string;
}

export default function ShareDialog({
  contentType,
  contentData,
  contentSnapshot,
  dateRangeStart,
  dateRangeEnd,
  trigger,
  isOpen,
  onOpenChange
}: ShareDialogProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [sharedContent, setSharedContent] = useState<SharedContent | null>(null);
  const { toast } = useToast();

  // Form setup
  const form = useForm<ShareFormData>({
    resolver: zodResolver(shareFormSchema),
    defaultValues: {
      title: "",
      description: "",
      shareType: "public",
      sharePassword: "",
      expiresAt: "",
      allowComments: false,
      showAuthorInfo: true,
    },
  });

  // Handle external dialog state
  const open = isOpen !== undefined ? isOpen : dialogOpen;
  const setOpen = onOpenChange || setDialogOpen;

  // Create shared content mutation
  const createShareMutation = useMutation({
    mutationFn: async (data: ShareFormData) => {
      const response = await fetch('/api/sharing/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          contentType,
          dataSelections: contentData,
          contentSnapshot,
          dateRangeStart: dateRangeStart?.toISOString(),
          dateRangeEnd: dateRangeEnd?.toISOString(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create share');
      }

      return response.json();
    },
    onSuccess: (data: SharedContent) => {
      setSharedContent(data);
      setShareUrl(`${window.location.origin}/share/${data.id}`);
      toast({
        title: "Share created successfully!",
        description: "Your content is now ready to share.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/sharing/content'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create share",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      form.reset();
      setSharedContent(null);
      setShareUrl("");
    }
  }, [open, form]);

  const onSubmit = (data: ShareFormData) => {
    createShareMutation.mutate(data);
  };

  const copyShareUrl = async () => {
    if (shareUrl) {
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: "Link copied!",
        description: "Share link has been copied to your clipboard.",
      });
    }
  };

  const getShareTypeIcon = (type: string) => {
    switch (type) {
      case "public": return <Globe className="h-4 w-4" />;
      case "password_protected": return <Lock className="h-4 w-4" />;
      case "private": return <Eye className="h-4 w-4" />;
      default: return <LinkIcon className="h-4 w-4" />;
    }
  };

  const getShareTypeDescription = (type: string) => {
    switch (type) {
      case "public": return "Anyone with the link can view";
      case "password_protected": return "Password required to view";
      case "private": return "Only you can access";
      default: return "";
    }
  };

  const generateSocialShareUrls = (url: string, title: string) => {
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);
    
    return {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
      email: `mailto:?subject=${encodedTitle}&body=Check out my health insights: ${encodedUrl}`,
      whatsapp: `https://wa.me/?text=${encodedTitle} ${encodedUrl}`,
    };
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto" data-testid="share-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share Your Health Insights
          </DialogTitle>
        </DialogHeader>

        {!sharedContent ? (
          // Share creation form
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Share Title</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="My Health Journey Progress"
                        {...field}
                        data-testid="input-share-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Share more context about your health insights..."
                        {...field}
                        data-testid="input-share-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="shareType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Privacy Setting</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-share-type">
                          <SelectValue placeholder="Select privacy level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="public">
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4" />
                            <div>
                              <div className="font-medium">Public</div>
                              <div className="text-sm text-muted-foreground">Anyone with the link can view</div>
                            </div>
                          </div>
                        </SelectItem>
                        <SelectItem value="password_protected">
                          <div className="flex items-center gap-2">
                            <Lock className="h-4 w-4" />
                            <div>
                              <div className="font-medium">Password Protected</div>
                              <div className="text-sm text-muted-foreground">Requires password to view</div>
                            </div>
                          </div>
                        </SelectItem>
                        <SelectItem value="private">
                          <div className="flex items-center gap-2">
                            <Eye className="h-4 w-4" />
                            <div>
                              <div className="font-medium">Private</div>
                              <div className="text-sm text-muted-foreground">Only you can access</div>
                            </div>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch("shareType") === "password_protected" && (
                <FormField
                  control={form.control}
                  name="sharePassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input 
                          type="password"
                          placeholder="Enter a secure password"
                          {...field}
                          data-testid="input-share-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="expiresAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expiration Date (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        type="datetime-local"
                        {...field}
                        data-testid="input-share-expires"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="allowComments"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Allow Comments</FormLabel>
                        <div className="text-sm text-muted-foreground">
                          Let others leave supportive comments on your share
                        </div>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-allow-comments"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="showAuthorInfo"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Show Author Info</FormLabel>
                        <div className="text-sm text-muted-foreground">
                          Display your name and profile info with the share
                        </div>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-show-author"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  className="flex-1"
                  data-testid="button-cancel-share"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createShareMutation.isPending}
                  className="flex-1"
                  data-testid="button-create-share"
                >
                  {createShareMutation.isPending ? "Creating..." : "Create Share"}
                </Button>
              </div>
            </form>
          </Form>
        ) : (
          // Share success and social sharing
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {getShareTypeIcon(sharedContent.shareType)}
                  Share Created Successfully!
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="gap-1">
                      {getShareTypeIcon(sharedContent.shareType)}
                      {sharedContent.shareType.replace('_', ' ')}
                    </Badge>
                    <div className="text-sm text-muted-foreground">
                      {sharedContent.viewCount} views
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {getShareTypeDescription(sharedContent.shareType)}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Share Link</label>
                  <div className="flex gap-2">
                    <Input 
                      value={shareUrl} 
                      readOnly 
                      className="flex-1"
                      data-testid="input-share-url"
                    />
                    <Button 
                      size="sm" 
                      onClick={copyShareUrl}
                      data-testid="button-copy-link"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Share on Social Media</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {(() => {
                    const socialUrls = generateSocialShareUrls(shareUrl, sharedContent.title);
                    return (
                      <>
                        <Button
                          variant="outline"
                          className="justify-start gap-2"
                          onClick={() => window.open(socialUrls.facebook, '_blank')}
                          data-testid="button-share-facebook"
                        >
                          <Facebook className="h-4 w-4" />
                          Facebook
                        </Button>
                        <Button
                          variant="outline"
                          className="justify-start gap-2"
                          onClick={() => window.open(socialUrls.twitter, '_blank')}
                          data-testid="button-share-twitter"
                        >
                          <Twitter className="h-4 w-4" />
                          Twitter
                        </Button>
                        <Button
                          variant="outline"
                          className="justify-start gap-2"
                          onClick={() => window.open(socialUrls.email, '_blank')}
                          data-testid="button-share-email"
                        >
                          <Mail className="h-4 w-4" />
                          Email
                        </Button>
                        <Button
                          variant="outline"
                          className="justify-start gap-2"
                          onClick={() => window.open(socialUrls.whatsapp, '_blank')}
                          data-testid="button-share-whatsapp"
                        >
                          <MessageCircle className="h-4 w-4" />
                          WhatsApp
                        </Button>
                      </>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                className="flex-1"
                data-testid="button-close-share"
              >
                Done
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSharedContent(null);
                  setShareUrl("");
                }}
                className="flex-1"
                data-testid="button-create-another"
              >
                Create Another
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}