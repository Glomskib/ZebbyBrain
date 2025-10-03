import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Shield, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Group {
  id: string;
  slug: string;
  name: string;
  userMembership?: {
    role: string;
  };
}

interface Report {
  id: string;
  groupId: string;
  targetType: "post" | "comment";
  targetId: string;
  reporterId: string;
  reporterName: string;
  reasonCode: string;
  notes: string | null;
  status: string;
  moderatorAction: string | null;
  moderatorNotes: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  targetContent: {
    body: string;
    authorId: string;
    authorName: string;
    isRemoved: boolean;
  } | null;
}

export default function ModQueue() {
  const [, params] = useRoute("/pastures/:slug/mod/reports");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedAction, setSelectedAction] = useState<string>("no_action");
  const [moderatorNotes, setModeratorNotes] = useState("");
  const [activeReportId, setActiveReportId] = useState<string | null>(null);

  const slug = params?.slug;

  // Fetch group to get groupId
  const { data: group } = useQuery<Group>({
    queryKey: [`/api/groups/${slug}`],
    enabled: !!slug,
  });

  // Fetch reports
  const { data: reports, isLoading } = useQuery<Report[]>({
    queryKey: [`/api/reports`, group?.id],
    queryFn: async () => {
      if (!group?.id) return [];
      const res = await fetch(`/api/reports?groupId=${group.id}&status=open`, {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error("Insufficient permissions");
        }
        throw new Error("Failed to fetch reports");
      }
      return res.json();
    },
    enabled: !!group?.id,
  });

  // Handle report action
  const handleReportMutation = useMutation({
    mutationFn: async ({ reportId, action }: { reportId: string; action: string }) => {
      return await apiRequest("PATCH", `/api/reports/${reportId}`, {
        status: action === "no_action" ? "dismissed" : "actioned",
        moderatorAction: action,
        moderatorNotes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/reports`, group?.id] });
      queryClient.invalidateQueries({ queryKey: [`/api/posts`, group?.id] });
      setActiveReportId(null);
      setSelectedAction("no_action");
      setModeratorNotes("");
      toast({
        title: "Success",
        description: "Report handled successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to handle report",
        variant: "destructive",
      });
    },
  });

  if (!group) {
    return <div>Loading...</div>;
  }

  // Check if user has mod permissions
  if (!group.userMembership || (group.userMembership.role !== 'owner' && group.userMembership.role !== 'moderator')) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
          <p className="text-muted-foreground">
            You must be a moderator to access this page.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-6 h-6" />
              Moderation Queue - {group.name}
            </CardTitle>
            <Button
              variant="outline"
              onClick={() => setLocation(`/groups/${slug}`)}
              data-testid="button-back-to-group"
            >
              Back to Group
            </Button>
          </div>
        </CardHeader>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : reports && reports.length > 0 ? (
        <div className="space-y-4">
          {reports.map((report) => (
            <Card key={report.id} data-testid={`report-${report.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                      <Badge variant="secondary" data-testid={`badge-type-${report.id}`}>
                        {report.targetType}
                      </Badge>
                      <Badge data-testid={`badge-reason-${report.id}`}>
                        {report.reasonCode}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Reported by {report.reporterName} on{" "}
                      {new Date(report.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Reported Content */}
                {report.targetContent && (
                  <div className="border-l-4 border-muted pl-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">
                        Content by {report.targetContent.authorName}
                      </p>
                      {report.targetContent.isRemoved && (
                        <Badge variant="destructive">Removed</Badge>
                      )}
                    </div>
                    <p
                      className="text-sm whitespace-pre-wrap"
                      data-testid={`text-content-${report.id}`}
                    >
                      {report.targetContent.body}
                    </p>
                  </div>
                )}

                {/* Reporter Notes */}
                {report.notes && (
                  <div>
                    <Label className="text-sm font-medium">Reporter Notes:</Label>
                    <p className="text-sm text-muted-foreground" data-testid={`text-notes-${report.id}`}>
                      {report.notes}
                    </p>
                  </div>
                )}

                {/* Action Panel */}
                {activeReportId === report.id ? (
                  <div className="space-y-4 border-t pt-4">
                    <div className="space-y-2">
                      <Label>Action</Label>
                      <Select value={selectedAction} onValueChange={setSelectedAction}>
                        <SelectTrigger data-testid={`select-action-${report.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="no_action" data-testid="option-no-action">
                            No Action (Dismiss)
                          </SelectItem>
                          <SelectItem value="removed" data-testid="option-remove">
                            Remove Content
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Moderator Notes (Optional)</Label>
                      <Textarea
                        value={moderatorNotes}
                        onChange={(e) => setModeratorNotes(e.target.value)}
                        placeholder="Add notes about your decision..."
                        rows={3}
                        data-testid={`textarea-notes-${report.id}`}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleReportMutation.mutate({ reportId: report.id, action: selectedAction })}
                        disabled={handleReportMutation.isPending}
                        data-testid={`button-submit-${report.id}`}
                      >
                        <Check className="w-4 h-4 mr-2" />
                        {handleReportMutation.isPending ? "Processing..." : "Submit"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setActiveReportId(null);
                          setSelectedAction("no_action");
                          setModeratorNotes("");
                        }}
                        data-testid={`button-cancel-${report.id}`}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={() => setActiveReportId(report.id)}
                    variant="outline"
                    data-testid={`button-handle-${report.id}`}
                  >
                    <Shield className="w-4 h-4 mr-2" />
                    Handle Report
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16 text-center">
            <Check className="w-12 h-12 mx-auto mb-4 text-green-500" />
            <h3 className="text-lg font-semibold mb-2">All Clear!</h3>
            <p className="text-muted-foreground">
              No pending reports. Great job keeping the community safe!
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
