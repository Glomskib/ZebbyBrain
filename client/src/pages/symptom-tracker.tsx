import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/navigation";
import SymptomLogger from "@/components/symptom-logger";
import SymptomChart from "@/components/symptom-chart";
import ZebbyAvatar from "@/components/zebby-avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { CalendarDays, Droplets, Heart, Zap, MapPin, Thermometer } from "lucide-react";

export default function SymptomTracker() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [showSymptomLogger, setShowSymptomLogger] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  // Fetch detailed symptom log when one is selected
  const { data: detailedLog, isLoading: detailLoading } = useQuery({
    queryKey: ['/api/symptoms', selectedLogId],
    queryFn: async () => {
      if (!selectedLogId) return null;
      const response = await fetch(`/api/symptoms/${selectedLogId}?withEntries=true`);
      if (!response.ok) throw new Error('Failed to fetch symptom details');
      return response.json();
    },
    enabled: !!selectedLogId,
    retry: false,
  });

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  // Fetch symptom logs with entries for enhanced display
  const { data: symptomLogs, isLoading: symptomsLoading } = useQuery({
    queryKey: ["/api/symptoms"],
    queryFn: async () => {
      const response = await fetch('/api/symptoms?withEntries=true');
      if (!response.ok) throw new Error('Failed to fetch symptom logs');
      return response.json();
    },
    enabled: isAuthenticated,
    retry: false,
  });

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <ZebbyAvatar size="large" />
          <p className="text-muted-foreground mt-4">Loading your tracker...</p>
        </div>
      </div>
    );
  }

  const recentLogs = (symptomLogs as any) || [];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Symptom Tracker</h1>
            <p className="text-muted-foreground">Track your symptoms and let Zebby help you understand your patterns.</p>
          </div>
          <Button 
            onClick={() => setShowSymptomLogger(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            data-testid="button-new-log"
          >
            <span className="mr-2">➕</span>
            New Entry
          </Button>
        </div>

        {symptomsLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-12 h-12 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading your symptom history...</p>
          </div>
        ) : (recentLogs as any).length > 0 ? (
          <div className="space-y-8">
            {/* Chart Section */}
            <Card>
              <CardContent className="p-6">
                <h2 className="text-xl font-semibold text-foreground mb-4">Your Symptom Patterns</h2>
                <SymptomChart symptoms={recentLogs as any} />
              </CardContent>
            </Card>

            {/* Recent Entries */}
            <Card>
              <CardContent className="p-6">
                <h2 className="text-xl font-semibold text-foreground mb-6">Recent Entries</h2>
                <div className="space-y-4">
                  {(recentLogs as any).slice(0, 10).map((log: any, index: number) => (
                    <div 
                      key={log.id || index} 
                      className="border border-border rounded-lg p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setSelectedLogId(log.id)}
                      data-testid={`entry-container-${index}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div 
                            className="text-sm text-muted-foreground"
                            data-testid={`timestamp-${index}`}
                          >
                            {new Date(log.timestamp).toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </div>
                          <Badge 
                            variant={log.intensity <= 3 ? "secondary" : log.intensity <= 6 ? "outline" : "destructive"}
                            data-testid={`badge-intensity-${index}`}
                          >
                            {log.intensity}/10
                          </Badge>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-xs text-muted-foreground hover:text-foreground"
                          data-testid={`button-view-details-${index}`}
                        >
                          View Details →
                        </Button>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 mb-3">
                        {(log.symptoms || (log.symptomEntries?.map((e: any) => e.symptomName) || [])).map((symptom: string, symptomIndex: number) => (
                          <span 
                            key={symptomIndex}
                            className="symptom-stamp text-white text-sm px-3 py-1 rounded-full"
                            data-testid={`symptom-tag-${index}-${symptomIndex}`}
                          >
                            {symptom}
                          </span>
                        ))}
                      </div>

                      {/* Contextual data preview */}
                      {(log.weatherTemp || log.heartRateBpm || log.waterIntakeCurrentMl) && (
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                          {log.weatherTemp && (
                            <div className="flex items-center gap-1">
                              <Thermometer className="h-3 w-3" />
                              {log.weatherTemp}°F
                            </div>
                          )}
                          {log.heartRateBpm && (
                            <div className="flex items-center gap-1">
                              <Heart className="h-3 w-3" />
                              {log.heartRateBpm} bpm
                            </div>
                          )}
                          {log.waterIntakeCurrentMl && (
                            <div className="flex items-center gap-1">
                              <Droplets className="h-3 w-3" />
                              {log.waterIntakeCurrentMl}ml
                            </div>
                          )}
                        </div>
                      )}

                      {log.notes && (
                        <p className="text-foreground text-sm mb-3" data-testid={`text-notes-${index}`}>
                          {log.notes}
                        </p>
                      )}

                      {log.aiReflection && (
                        <div className="bg-muted/50 rounded-lg p-3 mt-3">
                          <div className="flex items-start gap-3">
                            <ZebbyAvatar size="small" />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-foreground mb-1">Zebby's reflection:</div>
                              <p className="text-sm text-foreground leading-relaxed" data-testid={`text-ai-reflection-${index}`}>
                                {log.aiReflection}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {(recentLogs as any).length > 10 && (
                  <div className="text-center mt-6">
                    <Button 
                      variant="outline"
                      className="border-border text-foreground hover:bg-muted"
                      data-testid="button-load-more"
                    >
                      Load More Entries
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          // Empty State
          <div className="text-center py-16">
            <ZebbyAvatar size="large" />
            <h2 className="text-2xl font-semibold text-foreground mt-6 mb-3">
              Ready to Start Tracking?
            </h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-md mx-auto">
              Begin your journey with Zebby by logging your first symptom. 
              I'm here to listen and provide understanding insights.
            </p>
            <Button 
              onClick={() => setShowSymptomLogger(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground text-lg px-8 py-3"
              data-testid="button-first-log"
            >
              Log Your First Symptom
            </Button>
          </div>
        )}
      </main>

      {/* Symptom Logger Modal */}
      {showSymptomLogger && (
        <SymptomLogger 
          isOpen={showSymptomLogger}
          onClose={() => setShowSymptomLogger(false)}
        />
      )}

      {/* Symptom Detail Modal */}
      <Dialog open={!!selectedLogId} onOpenChange={() => setSelectedLogId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Symptom Entry Details
            </DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full"></div>
            </div>
          ) : detailedLog && (
            <div className="space-y-6">
              {/* Timestamp & Location */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-medium" data-testid="detail-timestamp">
                    {new Date((detailedLog as any).timestamp).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </div>
                  {(detailedLog as any).weatherLocation && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                      <MapPin className="h-3 w-3" />
                      {(detailedLog as any).weatherLocation}
                    </div>
                  )}
                </div>
                <Badge 
                  variant={(detailedLog as any).intensity <= 3 ? "secondary" : (detailedLog as any).intensity <= 6 ? "outline" : "destructive"}
                  className="text-lg px-3 py-1"
                >
                  {(detailedLog as any).intensity}/10 avg
                </Badge>
              </div>

              <Separator />

              {/* Individual Symptoms */}
              <div>
                <h3 className="text-lg font-medium mb-3">Individual Symptoms</h3>
                <div className="space-y-3">
                  {((detailedLog as any).symptomEntries || []).map((entry: any, index: number) => (
                    <div key={entry.id} className="bg-muted/30 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium" data-testid={`detail-symptom-name-${index}`}>{entry.symptomName}</span>
                        <Badge 
                          variant={entry.intensity <= 3 ? "secondary" : entry.intensity <= 6 ? "outline" : "destructive"}
                          data-testid={`detail-symptom-intensity-${index}`}
                        >
                          {entry.intensity}/10
                        </Badge>
                      </div>
                      {entry.notes && (
                        <p className="text-sm text-muted-foreground" data-testid={`detail-symptom-notes-${index}`}>
                          {entry.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Contextual Data */}
              <div>
                <h3 className="text-lg font-medium mb-3">Contextual Data</h3>
                <div className="grid grid-cols-2 gap-4">
                  {(detailedLog as any).weatherTemp && (
                    <div className="bg-muted/30 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Thermometer className="h-4 w-4 text-orange-500" />
                        <span className="text-sm font-medium">Temperature</span>
                      </div>
                      <div className="text-lg" data-testid="detail-weather-temp">{(detailedLog as any).weatherTemp}°F</div>
                      {(detailedLog as any).weatherCondition && (
                        <div className="text-xs text-muted-foreground" data-testid="detail-weather-condition">
                          {(detailedLog as any).weatherCondition}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {(detailedLog as any).heartRateBpm && (
                    <div className="bg-muted/30 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Heart className="h-4 w-4 text-red-500" />
                        <span className="text-sm font-medium">Heart Rate</span>
                      </div>
                      <div className="text-lg" data-testid="detail-heart-rate">{(detailedLog as any).heartRateBpm} bpm</div>
                    </div>
                  )}
                  
                  {(detailedLog as any).waterIntakeCurrentMl && (
                    <div className="bg-muted/30 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Droplets className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">Water Intake</span>
                      </div>
                      <div className="text-lg" data-testid="detail-water">{(detailedLog as any).waterIntakeCurrentMl}ml</div>
                    </div>
                  )}
                  
                  {(detailedLog as any).sodiumIntakeCurrentMg && (
                    <div className="bg-muted/30 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Zap className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm font-medium">Sodium Intake</span>
                      </div>
                      <div className="text-lg" data-testid="detail-sodium">{(detailedLog as any).sodiumIntakeCurrentMg}mg</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Session Notes */}
              {(detailedLog as any).notes && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-lg font-medium mb-3">Session Notes</h3>
                    <div className="bg-muted/30 rounded-lg p-3">
                      <p className="text-foreground" data-testid="detail-session-notes">{(detailedLog as any).notes}</p>
                    </div>
                  </div>
                </>
              )}

              {/* AI Reflection */}
              {(detailedLog as any).aiReflection && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-lg font-medium mb-3">Zebby's Reflection</h3>
                    <div className="bg-sky-50 dark:bg-sky-950/20 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <ZebbyAvatar size="small" />
                        <div className="flex-1">
                          <p className="text-foreground leading-relaxed" data-testid="detail-ai-reflection">
                            {(detailedLog as any).aiReflection}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
