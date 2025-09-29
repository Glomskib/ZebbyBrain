import { useState } from "react";
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
import { Users, Loader2, Heart } from "lucide-react";

interface CircleMember {
  id: number;
  email: string;
  role: string;
  status: string;
  pseudonym: string | null;
  userFirstName: string | null;
  userLastName: string | null;
}

export default function ReachOutButton() {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);

  // Fetch circle members
  const { data: circleData } = useQuery<{ members: CircleMember[] }>({
    queryKey: ['/api/circles/my-circle'],
    enabled: showDialog,
  });

  // Reach out mutation
  const reachOutMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/circles/reach-out', {
        memberIds: selectedMembers,
        message: message || undefined,
      });
    },
    onSuccess: () => {
      toast({
        title: "Support request sent",
        description: "Your circle members have been notified",
      });
      setShowDialog(false);
      setMessage("");
      setSelectedMembers([]);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send request",
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
            {activeMembers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>You don't have any active circle members yet.</p>
                <p className="text-sm mt-2">Visit the Personal Circle page to invite people.</p>
              </div>
            ) : (
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
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    A default message will be sent if you leave this blank
                  </p>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              data-testid="button-cancel-reach-out"
            >
              Cancel
            </Button>
            <Button
              onClick={() => reachOutMutation.mutate()}
              disabled={selectedMembers.length === 0 || reachOutMutation.isPending || activeMembers.length === 0}
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
