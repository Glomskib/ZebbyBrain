import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import Navigation from "@/components/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Users, 
  Mail, 
  Shield, 
  Bell, 
  UserPlus, 
  UserMinus, 
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  Info
} from "lucide-react";

interface CircleMember {
  id: number;
  email: string;
  role: string;
  status: string;
  pseudonym: string | null;
  createdAt: string;
  userFirstName: string | null;
  userLastName: string | null;
}

interface CircleScope {
  shareSymptoms: boolean;
  shareVitals: boolean;
  shareSleep: boolean;
  shareHydration: boolean;
  shareAIReflections: boolean;
  detailLevel: string;
  daysBack: number;
}

interface CircleAlertRule {
  active: boolean;
  quietStart: string | null;
  quietEnd: string | null;
  cooldownMin: number;
  flareThreshold: number | null;
  hrDeltaBpm: number | null;
  lowSleepHours: string | null;
  channelEmail: boolean;
  notifyGuardianFirst: boolean;
}

interface PendingAlert {
  id: string;
  triggerReason: string;
  scheduledFor: string;
  createdAt: string;
  canceledAt: string | null;
}

export default function PersonalCircle() {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  // Fetch circle data
  const { data: circleData, isLoading } = useQuery<{
    circle: any;
    members: CircleMember[];
    scope: CircleScope;
    alertRules: CircleAlertRule;
  }>({
    queryKey: ['/api/circles/my-circle'],
    enabled: isAuthenticated,
  });

  // Fetch pending alerts
  const { data: pendingAlertsData } = useQuery<{ pendingAlerts: PendingAlert[] }>({
    queryKey: ['/api/circles/pending-alerts'],
    enabled: isAuthenticated,
  });

  // Invite member mutation
  const inviteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/circles/invite', { 
        email: inviteEmail, 
        role: inviteRole 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/circles/my-circle'] });
      toast({
        title: "Invitation sent",
        description: "An email invitation has been sent to " + inviteEmail,
      });
      setInviteEmail("");
      setInviteRole("member");
      setShowInviteDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Invitation failed",
        description: error.message || "Failed to send invitation",
        variant: "destructive",
      });
    },
  });

  // Revoke member mutation
  const revokeMutation = useMutation({
    mutationFn: async (memberId: number) => {
      return apiRequest('PATCH', `/api/circles/members/${memberId}/revoke`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/circles/my-circle'] });
      toast({
        title: "Access revoked",
        description: "Member access has been revoked",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to revoke access",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update scope mutation
  const updateScopeMutation = useMutation({
    mutationFn: async (newScope: Partial<CircleScope>) => {
      return apiRequest('PATCH', '/api/circles/scope', newScope);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/circles/my-circle'] });
      toast({
        title: "Privacy settings updated",
        description: "Your sharing preferences have been saved",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update alert rules mutation
  const updateAlertRulesMutation = useMutation({
    mutationFn: async (newRules: Partial<CircleAlertRule>) => {
      return apiRequest('PATCH', '/api/circles/alert-rules', newRules);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/circles/my-circle'] });
      toast({
        title: "Alert settings updated",
        description: "Your automated alert rules have been saved",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Cancel pending alert mutation
  const cancelAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      return apiRequest('POST', `/api/circles/cancel-pending-alert/${alertId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/circles/pending-alerts'] });
      toast({
        title: "Alert cancelled",
        description: "The automated alert has been cancelled",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Cancellation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen sky-background">
        <Navigation />
        <div className="max-w-6xl mx-auto p-6 flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" data-testid="loader-circle" />
        </div>
      </div>
    );
  }

  const members = circleData?.members || [];
  const scope = circleData?.scope;
  const alertRules = circleData?.alertRules;
  const pendingAlerts = pendingAlertsData?.pendingAlerts || [];
  const activePendingAlerts = pendingAlerts.filter(alert => !alert.canceledAt);

  const handleScopeChange = (key: keyof CircleScope, value: any) => {
    if (!scope) return;
    updateScopeMutation.mutate({ [key]: value });
  };

  const handleAlertRuleChange = (key: keyof CircleAlertRule, value: any) => {
    if (!alertRules) return;
    updateAlertRulesMutation.mutate({ [key]: value });
  };

  return (
    <div className="min-h-screen sky-background">
      <Navigation />
      
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="h-8 w-8 text-primary" />
            Spoonies
          </h1>
          <p className="text-muted-foreground mt-2">
            Share your health journey with trusted family, friends, and caregivers
          </p>
        </div>

        {/* Pending Alerts Banner */}
        {activePendingAlerts.length > 0 && (
          <Card className="mb-6 border-orange-200 bg-orange-50 dark:bg-orange-950" data-testid="card-pending-alerts">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-800 dark:text-orange-200">
                <Clock className="h-5 w-5" />
                Pending Automated Alerts ({activePendingAlerts.length})
              </CardTitle>
              <CardDescription className="text-orange-700 dark:text-orange-300">
                These alerts will be sent to your circle unless you cancel them
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {activePendingAlerts.map((alert) => {
                const scheduledDate = new Date(alert.scheduledFor);
                const createdDate = new Date(alert.createdAt);
                const timeUntilSend = Math.round((scheduledDate.getTime() - Date.now()) / 1000 / 60);
                
                return (
                  <div key={alert.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 rounded-lg" data-testid={`alert-pending-${alert.id}`}>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{alert.triggerReason}</p>
                      <p className="text-xs text-muted-foreground">
                        {timeUntilSend > 0 
                          ? `Sending in ${timeUntilSend} minutes`
                          : 'Sending soon...'}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => cancelAlertMutation.mutate(alert.id)}
                      disabled={cancelAlertMutation.isPending}
                      data-testid={`button-cancel-alert-${alert.id}`}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Members Section */}
          <Card data-testid="card-members">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Circle Members ({members.length})
                  </CardTitle>
                  <CardDescription>
                    People who can view your health updates
                  </CardDescription>
                </div>
                <Button 
                  size="sm" 
                  onClick={() => setShowInviteDialog(true)}
                  data-testid="button-invite-member"
                >
                  <UserPlus className="h-4 w-4 mr-1" />
                  Invite
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Info className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No members yet. Invite someone to start sharing.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {members.map((member) => (
                    <div 
                      key={member.id} 
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`member-${member.id}`}
                    >
                      <div className="flex-1">
                        <p className="font-medium">
                          {member.userFirstName && member.userLastName
                            ? `${member.userFirstName} ${member.userLastName}`
                            : member.email}
                        </p>
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {member.role}
                          </Badge>
                          <Badge 
                            variant={member.status === 'active' ? 'default' : 'outline'}
                            className="text-xs"
                          >
                            {member.status === 'active' ? <CheckCircle className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
                            {member.status}
                          </Badge>
                        </div>
                      </div>
                      {member.status === 'active' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => revokeMutation.mutate(member.id)}
                          disabled={revokeMutation.isPending}
                          data-testid={`button-revoke-${member.id}`}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Privacy Scope Section */}
          <Card data-testid="card-privacy-scope">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Privacy & Sharing
              </CardTitle>
              <CardDescription>
                Control what health data your circle can see
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {scope && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="share-symptoms">Symptom Logs</Label>
                      <p className="text-xs text-muted-foreground">
                        Share your symptom entries and intensity
                      </p>
                    </div>
                    <Switch
                      id="share-symptoms"
                      checked={scope.shareSymptoms}
                      onCheckedChange={(checked) => handleScopeChange('shareSymptoms', checked)}
                      disabled={updateScopeMutation.isPending}
                      data-testid="switch-share-symptoms"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="share-vitals">Vital Signs</Label>
                      <p className="text-xs text-muted-foreground">
                        Share blood pressure, heart rate, temperature
                      </p>
                    </div>
                    <Switch
                      id="share-vitals"
                      checked={scope.shareVitals}
                      onCheckedChange={(checked) => handleScopeChange('shareVitals', checked)}
                      disabled={updateScopeMutation.isPending}
                      data-testid="switch-share-vitals"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="share-sleep">Sleep Data</Label>
                      <p className="text-xs text-muted-foreground">
                        Share sleep duration and quality
                      </p>
                    </div>
                    <Switch
                      id="share-sleep"
                      checked={scope.shareSleep}
                      onCheckedChange={(checked) => handleScopeChange('shareSleep', checked)}
                      disabled={updateScopeMutation.isPending}
                      data-testid="switch-share-sleep"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="share-hydration">Hydration Tracking</Label>
                      <p className="text-xs text-muted-foreground">
                        Share water and sodium intake
                      </p>
                    </div>
                    <Switch
                      id="share-hydration"
                      checked={scope.shareHydration}
                      onCheckedChange={(checked) => handleScopeChange('shareHydration', checked)}
                      disabled={updateScopeMutation.isPending}
                      data-testid="switch-share-hydration"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="share-ai">AI Reflections</Label>
                      <p className="text-xs text-muted-foreground">
                        Share Zebby's supportive messages
                      </p>
                    </div>
                    <Switch
                      id="share-ai"
                      checked={scope.shareAIReflections}
                      onCheckedChange={(checked) => handleScopeChange('shareAIReflections', checked)}
                      disabled={updateScopeMutation.isPending}
                      data-testid="switch-share-ai"
                    />
                  </div>

                  <div className="pt-4 border-t">
                    <Label htmlFor="detail-level">Detail Level</Label>
                    <Select 
                      value={scope.detailLevel} 
                      onValueChange={(value) => handleScopeChange('detailLevel', value)}
                      disabled={updateScopeMutation.isPending}
                    >
                      <SelectTrigger id="detail-level" data-testid="select-detail-level">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="summary">Summary Only</SelectItem>
                        <SelectItem value="detail">Full Detail</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Summary shows basics, Detail includes notes and context
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="days-back">Time Window (Days)</Label>
                    <Select 
                      value={String(scope.daysBack)} 
                      onValueChange={(value) => handleScopeChange('daysBack', parseInt(value))}
                      disabled={updateScopeMutation.isPending}
                    >
                      <SelectTrigger id="days-back" data-testid="select-days-back">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Last 24 hours</SelectItem>
                        <SelectItem value="7">Last week</SelectItem>
                        <SelectItem value="30">Last 30 days</SelectItem>
                        <SelectItem value="90">Last 90 days</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      How far back members can view your data
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Alert Rules Section */}
          <Card className="lg:col-span-2" data-testid="card-alert-rules">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Automated Alerts
              </CardTitle>
              <CardDescription>
                Automatically notify your circle when health thresholds are reached
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {alertRules && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="alerts-active" className="text-base font-medium">Enable Automated Alerts</Label>
                      <p className="text-sm text-muted-foreground">
                        Send automatic notifications based on your health data
                      </p>
                    </div>
                    <Switch
                      id="alerts-active"
                      checked={alertRules.active}
                      onCheckedChange={(checked) => handleAlertRuleChange('active', checked)}
                      disabled={updateAlertRulesMutation.isPending}
                      data-testid="switch-alerts-active"
                    />
                  </div>

                  {alertRules.active && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
                        <div className="space-y-2">
                          <Label htmlFor="flare-threshold">Pain Flare Threshold (1-10)</Label>
                          <Input
                            id="flare-threshold"
                            type="number"
                            min="1"
                            max="10"
                            value={alertRules.flareThreshold || ''}
                            onChange={(e) => handleAlertRuleChange('flareThreshold', parseInt(e.target.value) || null)}
                            placeholder="e.g., 8"
                            disabled={updateAlertRulesMutation.isPending}
                            data-testid="input-flare-threshold"
                          />
                          <p className="text-xs text-muted-foreground">
                            Alert when pain intensity reaches this level
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="hr-delta">Heart Rate Change (BPM)</Label>
                          <Input
                            id="hr-delta"
                            type="number"
                            min="0"
                            value={alertRules.hrDeltaBpm || ''}
                            onChange={(e) => handleAlertRuleChange('hrDeltaBpm', parseInt(e.target.value) || null)}
                            placeholder="e.g., 30"
                            disabled={updateAlertRulesMutation.isPending}
                            data-testid="input-hr-delta"
                          />
                          <p className="text-xs text-muted-foreground">
                            Alert on significant heart rate variation (POTS indicator)
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="low-sleep">Low Sleep Hours</Label>
                          <Input
                            id="low-sleep"
                            type="number"
                            step="0.5"
                            min="0"
                            max="12"
                            value={alertRules.lowSleepHours || ''}
                            onChange={(e) => handleAlertRuleChange('lowSleepHours', e.target.value || null)}
                            placeholder="e.g., 5"
                            disabled={updateAlertRulesMutation.isPending}
                            data-testid="input-low-sleep"
                          />
                          <p className="text-xs text-muted-foreground">
                            Alert when sleep duration falls below this threshold
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="cooldown">Cooldown Period (Minutes)</Label>
                          <Input
                            id="cooldown"
                            type="number"
                            min="15"
                            value={alertRules.cooldownMin}
                            onChange={(e) => handleAlertRuleChange('cooldownMin', parseInt(e.target.value))}
                            disabled={updateAlertRulesMutation.isPending}
                            data-testid="input-cooldown"
                          />
                          <p className="text-xs text-muted-foreground">
                            Minimum time between automated alerts
                          </p>
                        </div>
                      </div>

                      <div className="pt-4 border-t space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="quiet-start">Quiet Hours Start</Label>
                            <Input
                              id="quiet-start"
                              type="time"
                              value={alertRules.quietStart || ''}
                              onChange={(e) => handleAlertRuleChange('quietStart', e.target.value || null)}
                              disabled={updateAlertRulesMutation.isPending}
                              data-testid="input-quiet-start"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="quiet-end">Quiet Hours End</Label>
                            <Input
                              id="quiet-end"
                              type="time"
                              value={alertRules.quietEnd || ''}
                              onChange={(e) => handleAlertRuleChange('quietEnd', e.target.value || null)}
                              disabled={updateAlertRulesMutation.isPending}
                              data-testid="input-quiet-end"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          No alerts will be sent during these hours (e.g., 22:00 to 07:00)
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t">
                        <div className="space-y-0.5">
                          <Label htmlFor="channel-email">Email Notifications</Label>
                          <p className="text-xs text-muted-foreground">
                            Send alerts via email to your circle members
                          </p>
                        </div>
                        <Switch
                          id="channel-email"
                          checked={alertRules.channelEmail}
                          onCheckedChange={(checked) => handleAlertRuleChange('channelEmail', checked)}
                          disabled={updateAlertRulesMutation.isPending}
                          data-testid="switch-channel-email"
                        />
                      </div>

                      <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                        <div className="flex gap-3">
                          <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                          <div className="text-sm space-y-1">
                            <p className="font-medium text-blue-900 dark:text-blue-100">
                              15-Minute Cancel Window
                            </p>
                            <p className="text-blue-700 dark:text-blue-300">
                              When an alert is triggered, you'll have 15 minutes to cancel it before it's sent to your circle. 
                              Pending alerts will appear in the banner above.
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Invite Dialog */}
        <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
          <DialogContent data-testid="dialog-invite-member">
            <DialogHeader>
              <DialogTitle>Invite to Your Circle</DialogTitle>
              <DialogDescription>
                Send an invitation to someone you trust to view your health updates
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email Address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="friend@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  data-testid="input-invite-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger id="invite-role" data-testid="select-invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="guardian">Guardian</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Guardians receive priority notifications (future feature)
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setShowInviteDialog(false)}
                data-testid="button-cancel-invite"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => inviteMutation.mutate()}
                disabled={!inviteEmail || inviteMutation.isPending}
                data-testid="button-send-invite"
              >
                {inviteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Send Invitation
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
