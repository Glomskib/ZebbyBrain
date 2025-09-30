import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, Loader2, Heart, Clock, AlertTriangle } from "lucide-react";

interface CircleMember {
  id: number;
  email: string;
  role: string;
  status: string;
  pseudonym: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  userId?: string;
}

export default function ReachOutButton() {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [cancelToken, setCancelToken] = useState<string | null>(null);
  const [windowExpiresAt, setWindowExpiresAt] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [rateLimitError, setRateLimitError] = useState<{ count: number; limit: number } | null>(null);
  
  const isHerdEnabled = import.meta.env.VITE_FF_HERD === "true";

  // Fetch circle members
  const { data: circleData } = useQuery<{ members: CircleMember[] }>({
    queryKey: ['/api/circles/my-circle'],
    enabled: showDialog,
  });

  // Countdown timer effect
  useEffect(() => {
    if (!windowExpiresAt) return;
    
    const updateTimer = () => {
      const now = new Date().getTime();
      const expiresAt = new Date(windowExpiresAt).getTime();
      const remaining = Math.max(0, expiresAt - now);
      setTimeRemaining(remaining);
      
      if (remaining === 0) {
        setCancelToken(null);
        setWindowExpiresAt(null);
        toast({
          title: "Reach-out sent",
          description: "Your circle members have been notified",
        });
        setShowDialog(false);
        setMessage("");
        setSelectedMembers([]);
      }
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 100);
    return () => clearInterval(interval);
  }, [windowExpiresAt, toast]);

  // Reach out mutation (new herd API with cancel window)
  const reachOutMutation = useMutation({
    mutationFn: async () => {
      if (isHerdEnabled) {
        // Get member userIds
        const memberUserIds = activeMembers
          .filter(m => selectedMembers.includes(m.id))
          .map(m => m.userId)
          .filter(Boolean);
        
        return apiRequest('POST', '/api/herd/reach-out', {
          recipients: memberUserIds,
          message: message || undefined,
        });
      } else {
        // Legacy instant send
        return apiRequest('POST', '/api/circles/reach-out', {
          memberIds: selectedMembers,
          message: message || undefined,
        });
      }
    },
    onSuccess: (data: any) => {
      setRateLimitError(null);
      
      if (isHerdEnabled && data.cancelToken) {
        // Pending with cancel window
        setCancelToken(data.cancelToken);
        setWindowExpiresAt(data.windowExpiresAt);
        toast({
          title: "Reach-out pending",
          description: `You have ${Math.round((new Date(data.windowExpiresAt).getTime() - Date.now()) / 60000)} minutes to cancel`,
        });
      } else {
        // Instant send (legacy or herd without cancel)
        toast({
          title: "Support request sent",
          description: "Your circle members have been notified",
        });
        setShowDialog(false);
        setMessage("");
        setSelectedMembers([]);
      }
    },
    onError: (error: any) => {
      if (error.message === "rate_limited" && error.count && error.limit) {
        setRateLimitError({ count: error.count, limit: error.limit });
        return;
      }
      
      toast({
        title: "Failed to send request",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!cancelToken) throw new Error("No cancel token");
      return apiRequest('POST', '/api/herd/cancel', { cancelToken });
    },
    onSuccess: () => {
      toast({
        title: "Reach-out canceled",
        description: "Your request has been canceled",
      });
      setCancelToken(null);
      setWindowExpiresAt(null);
      setShowDialog(false);
      setMessage("");
      setSelectedMembers([]);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to cancel",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const members = circleData?.members || [];
  const activeMembers = members.filter(m => m.status === 'active');

  const handleMemberToggle = (memberId: number) => {
    setSelectedMembers(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  const selectAll = () => {
    setSelectedMembers(activeMembers.map(m => m.id));
  };

  const getMemberDisplay = (member: CircleMember) => {
    if (member.userFirstName && member.userLastName) {
      return `${member.userFirstName} ${member.userLastName}`;
    }
    return member.email;
  };

  return (
    <>
      <Button
        variant="outline"
        className="border-white/30 text-white hover:bg-white/20"
        onClick={() => setShowDialog(true)}
        data-testid="button-reach-out"
      >
        <Heart className="h-4 w-4 mr-2" />
        Reach Out to My Circle
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-reach-out">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Reach Out for Support
            </DialogTitle>
            <DialogDescription>
              Send a notification to selected members of your circle when you need support
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Rate limit error */}
            {rateLimitError && (
              <Alert variant="destructive" data-testid="alert-rate-limit">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  You've reached the limit of {rateLimitError.limit} reach-outs per hour. 
                  Please wait before sending another request.
                </AlertDescription>
              </Alert>
            )}

            {/* Pending with countdown */}
            {cancelToken && windowExpiresAt && (
              <Alert className="bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800" data-testid="alert-pending">
                <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                  <div className="flex items-center justify-between">
                    <span>
                      Reach-out pending - sending in {Math.floor(timeRemaining / 60000)}:
                      {String(Math.floor((timeRemaining % 60000) / 1000)).padStart(2, '0')}
                    </span>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Member selection - only show if not pending */}
            {!cancelToken && activeMembers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>You don't have any active circle members yet.</p>
                <p className="text-sm mt-2">Visit the Personal Circle page to invite people.</p>
              </div>
            ) : !cancelToken ? (
              <>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label>Select Members to Notify</Label>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={selectAll}
                      className="h-auto p-0"
                      data-testid="button-select-all"
                    >
                      Select All
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                    {activeMembers.map(member => (
                      <div key={member.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`member-${member.id}`}
                          checked={selectedMembers.includes(member.id)}
                          onCheckedChange={() => handleMemberToggle(member.id)}
                          data-testid={`checkbox-member-${member.id}`}
                        />
                        <Label
                          htmlFor={`member-${member.id}`}
                          className="text-sm font-normal cursor-pointer flex-1"
                        >
                          {getMemberDisplay(member)}
                          <span className="text-xs text-muted-foreground ml-2">
                            ({member.role})
                          </span>
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="message">Optional Message</Label>
                  <Textarea
                    id="message"
                    placeholder="Add a personal message (optional)..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    className="mt-2"
                    data-testid="textarea-reach-out-message"
                    maxLength={500}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {isHerdEnabled 
                      ? "You'll have 10 minutes to cancel after sending"
                      : "A default message will be sent if you leave this blank"}
                  </p>
                </div>
              </>
            ) : null}
          </div>

          <DialogFooter>
            {cancelToken ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowDialog(false)}
                  data-testid="button-close-pending"
                >
                  Close
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  data-testid="button-cancel-pending"
                >
                  {cancelMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Canceling...
                    </>
                  ) : (
                    "Cancel Reach-Out"
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDialog(false);
                    setRateLimitError(null);
                  }}
                  data-testid="button-cancel-reach-out"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => reachOutMutation.mutate()}
                  disabled={selectedMembers.length === 0 || reachOutMutation.isPending || activeMembers.length === 0 || !!rateLimitError}
                  data-testid="button-send-reach-out"
                >
                  {reachOutMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Heart className="h-4 w-4 mr-2" />
                      Send Request
                    </>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
