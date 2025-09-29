import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import Navigation from "@/components/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Activity, 
  Heart, 
  TrendingUp,
  Clock,
  Droplet,
  Moon,
  AlertCircle,
  User,
  Calendar,
  Sparkles,
  Info
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface ScopeSettings {
  shareSymptoms: boolean;
  shareVitals: boolean;
  shareSleep: boolean;
  shareHydration: boolean;
  shareAIReflections: boolean;
  detailLevel: 'summary' | 'detail';
  daysBack: number;
}

interface TodaySnapshot {
  date: string;
  circleName: string;
  memberRole: string;
  scope: ScopeSettings;
  data: {
    latestSymptoms?: {
      timestamp: string;
      entries: Array<{
        symptomName: string;
        intensity: number;
      }>;
      heartRate?: number;
    };
    recentVitals?: Array<{
      type: string;
      value: number;
      unit: string;
      timestamp: string;
    }>;
    todayHydration?: {
      waterMl: number;
      sodiumMg: number;
    };
    lastSleep?: {
      bedtime: string;
      wakeTime: string;
      totalMinutes: number;
      quality: string;
    };
  };
}

interface HealthFeed {
  ownerInfo: {
    circleId: number;
    circleName: string;
    memberRole: string;
  };
  scope: ScopeSettings;
  data: {
    symptoms?: Array<{
      id: number;
      timestamp: string;
      notes?: string;
      aiReflection?: string;
      heartRateBpm?: number;
      entries: Array<{
        symptomName: string;
        intensity: number;
        notes?: string;
      }>;
    }>;
    vitals?: Array<{
      id: number;
      timestamp: string;
      type: string;
      value: number;
      unit: string;
      notes?: string;
    }>;
    sleep?: Array<{
      id: number;
      bedtime: string;
      wakeTime: string;
      totalMinutes: number;
      quality: string;
      notes?: string;
    }>;
    hydration?: {
      water: Array<{
        id: number;
        timestamp: string;
        amountMl: number;
      }>;
      sodium: Array<{
        id: number;
        timestamp: string;
        amountMg: number;
      }>;
    };
  };
}

export default function MemberDashboard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Fetch today's snapshot
  const { data: snapshotData, isLoading: snapshotLoading, error: snapshotError } = useQuery<TodaySnapshot>({
    queryKey: ['/api/circles/member/today'],
    enabled: isAuthenticated,
  });

  // Fetch health feed
  const { data: feedData, isLoading: feedLoading, error: feedError } = useQuery<HealthFeed>({
    queryKey: ['/api/circles/member/feed'],
    enabled: isAuthenticated,
  });

  if (authLoading || snapshotLoading || feedLoading) {
    return (
      <div className="min-h-screen sky-background">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        </main>
      </div>
    );
  }

  if (!isAuthenticated) {
    setLocation("/");
    return null;
  }

  // Handle errors
  if (snapshotError || feedError) {
    const errorMessage = (snapshotError as any)?.message || (feedError as any)?.message || "Failed to load data";
    
    return (
      <div className="min-h-screen sky-background">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Alert variant="destructive" data-testid="alert-member-error">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        </main>
      </div>
    );
  }

  const scope = snapshotData?.scope || feedData?.scope;
  const ownerName = feedData?.ownerInfo.circleName || snapshotData?.circleName || "Circle Owner";

  const getIntensityBadge = (intensity: number) => {
    if (intensity >= 8) return "destructive";
    if (intensity >= 5) return "default";
    return "secondary";
  };

  // Build a unified timeline from feed data
  const buildTimeline = () => {
    if (!feedData?.data) return [];

    const timeline: Array<{
      id: string;
      timestamp: Date;
      type: string;
      content: JSX.Element;
    }> = [];

    // Add symptoms
    if (scope?.shareSymptoms && feedData.data.symptoms) {
      feedData.data.symptoms.forEach(symptom => {
        timeline.push({
          id: `symptom-${symptom.id}`,
          timestamp: new Date(symptom.timestamp),
          type: 'symptom',
          content: (
            <div className="flex items-start gap-4 pb-4" data-testid={`feed-symptom-${symptom.id}`}>
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground mb-1">Symptom Log</p>
                <div className="space-y-1">
                  {symptom.entries.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{entry.symptomName}</span>
                      <Badge variant={getIntensityBadge(entry.intensity)}>
                        {entry.intensity}/10
                      </Badge>
                    </div>
                  ))}
                </div>
                {symptom.heartRateBpm && (
                  <p className="text-xs text-muted-foreground mt-1">HR: {symptom.heartRateBpm} BPM</p>
                )}
                {scope.detailLevel === 'detail' && symptom.notes && (
                  <p className="text-sm text-muted-foreground mt-1">{symptom.notes}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(symptom.timestamp), { addSuffix: true })}
                </p>
              </div>
            </div>
          )
        });
      });
    }

    // Add vitals
    if (scope?.shareVitals && feedData.data.vitals) {
      feedData.data.vitals.forEach(vital => {
        timeline.push({
          id: `vital-${vital.id}`,
          timestamp: new Date(vital.timestamp),
          type: 'vital',
          content: (
            <div className="flex items-start gap-4 pb-4" data-testid={`feed-vital-${vital.id}`}>
              <div className="w-10 h-10 bg-accent/10 rounded-full flex items-center justify-center flex-shrink-0">
                <Heart className="w-5 h-5 text-accent" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground mb-1">{vital.type}</p>
                <p className="text-sm text-muted-foreground">
                  {vital.value} {vital.unit}
                </p>
                {scope.detailLevel === 'detail' && vital.notes && (
                  <p className="text-sm text-muted-foreground mt-1">{vital.notes}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(vital.timestamp), { addSuffix: true })}
                </p>
              </div>
            </div>
          )
        });
      });
    }

    // Add sleep
    if (scope?.shareSleep && feedData.data.sleep) {
      feedData.data.sleep.forEach(sleep => {
        const hours = Math.floor(sleep.totalMinutes / 60);
        const minutes = sleep.totalMinutes % 60;
        timeline.push({
          id: `sleep-${sleep.id}`,
          timestamp: new Date(sleep.bedtime),
          type: 'sleep',
          content: (
            <div className="flex items-start gap-4 pb-4" data-testid={`feed-sleep-${sleep.id}`}>
              <div className="w-10 h-10 bg-secondary/10 rounded-full flex items-center justify-center flex-shrink-0">
                <Moon className="w-5 h-5 text-secondary" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground mb-1">Sleep Log</p>
                <p className="text-sm text-muted-foreground">
                  {hours}h {minutes}m • {sleep.quality} quality
                </p>
                {scope.detailLevel === 'detail' && sleep.notes && (
                  <p className="text-sm text-muted-foreground mt-1">{sleep.notes}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(sleep.bedtime), { addSuffix: true })}
                </p>
              </div>
            </div>
          )
        });
      });
    }

    // Add hydration
    if (scope?.shareHydration && feedData.data.hydration) {
      feedData.data.hydration.water.forEach(water => {
        const cups = Math.round(water.amountMl / 237); // Convert ml to cups
        timeline.push({
          id: `water-${water.id}`,
          timestamp: new Date(water.timestamp),
          type: 'hydration',
          content: (
            <div className="flex items-start gap-4 pb-4" data-testid={`feed-hydration-${water.id}`}>
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                <Droplet className="w-5 h-5 text-blue-500" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground mb-1">Water Intake</p>
                <p className="text-sm text-muted-foreground">{water.amountMl} ml (~{cups} cups)</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(water.timestamp), { addSuffix: true })}
                </p>
              </div>
            </div>
          )
        });
      });
    }

    // Sort by timestamp descending
    return timeline.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  };

  const timeline = buildTimeline();

  return (
    <div className="min-h-screen sky-background">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <User className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-foreground" data-testid="text-owner-name">
                {ownerName}'s Health
              </h1>
              <p className="text-muted-foreground">
                You're viewing health data from your circle
              </p>
            </div>
          </div>
        </div>

        {/* Privacy Info Banner */}
        {scope && (
          <Alert className="mb-6" data-testid="alert-privacy-info">
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Privacy Settings:</strong> You can see{' '}
              {[
                scope.shareSymptoms && 'symptoms',
                scope.shareVitals && 'vitals',
                scope.shareSleep && 'sleep',
                scope.shareHydration && 'hydration',
                scope.shareAIReflections && 'AI reflections',
              ].filter(Boolean).join(', ')}{' '}
              from the last {scope.daysBack} days with {scope.detailLevel} level of detail.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Today's Snapshot */}
          <div className="lg:col-span-1">
            <Card data-testid="card-today-snapshot">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Today's Snapshot
                </CardTitle>
                <CardDescription>Current status for {format(new Date(), 'MMM d, yyyy')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {snapshotData?.data.latestSymptoms && scope?.shareSymptoms && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      Latest Symptoms
                    </h4>
                    <div className="space-y-2">
                      {snapshotData.data.latestSymptoms.entries.map((entry, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{entry.symptomName}</span>
                          <Badge variant={getIntensityBadge(entry.intensity)}>
                            {entry.intensity}/10
                          </Badge>
                        </div>
                      ))}
                    </div>
                    {snapshotData.data.latestSymptoms.heartRate && (
                      <p className="text-xs text-muted-foreground mt-1">
                        HR: {snapshotData.data.latestSymptoms.heartRate} BPM
                      </p>
                    )}
                  </div>
                )}

                {snapshotData?.data.recentVitals && snapshotData.data.recentVitals.length > 0 && scope?.shareVitals && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                      <Heart className="w-4 h-4" />
                      Recent Vitals
                    </h4>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      {snapshotData.data.recentVitals.map((vital, idx) => (
                        <p key={idx}>
                          {vital.type}: {vital.value} {vital.unit}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {snapshotData?.data.lastSleep && scope?.shareSleep && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                      <Moon className="w-4 h-4" />
                      Last Night's Sleep
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {Math.floor(snapshotData.data.lastSleep.totalMinutes / 60)}h{' '}
                      {snapshotData.data.lastSleep.totalMinutes % 60}m • {snapshotData.data.lastSleep.quality}
                    </p>
                  </div>
                )}

                {snapshotData?.data.todayHydration && scope?.shareHydration && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                      <Droplet className="w-4 h-4" />
                      Today's Hydration
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {snapshotData.data.todayHydration.waterMl} ml water
                    </p>
                    {snapshotData.data.todayHydration.sodiumMg > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {snapshotData.data.todayHydration.sodiumMg} mg sodium
                      </p>
                    )}
                  </div>
                )}

                {(!snapshotData?.data || 
                  (!snapshotData.data.latestSymptoms &&
                   (!snapshotData.data.recentVitals || snapshotData.data.recentVitals.length === 0) &&
                   !snapshotData.data.lastSleep &&
                   !snapshotData.data.todayHydration)) && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No data logged today yet
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Health Feed */}
          <div className="lg:col-span-2">
            <Card data-testid="card-health-feed">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Health Activity Feed
                </CardTitle>
                <CardDescription>
                  Recent health updates from {ownerName}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {timeline.length > 0 ? (
                  <div className="space-y-4">
                    {timeline.map((item, idx) => (
                      <div key={item.id}>
                        {item.content}
                        {idx < timeline.length - 1 && <Separator />}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium mb-1">No recent activity</p>
                    <p className="text-sm">
                      Check back later for updates from {ownerName}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
