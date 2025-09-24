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

export default function SymptomTracker() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [showSymptomLogger, setShowSymptomLogger] = useState(false);

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

  // Fetch symptom logs
  const { data: symptomLogs, isLoading: symptomsLoading } = useQuery({
    queryKey: ["/api/symptoms"],
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
                    <div key={log.id || index} className="border border-border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="text-sm text-muted-foreground">
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
                      </div>
                      
                      <div className="flex flex-wrap gap-2 mb-3">
                        {log.symptoms.map((symptom: string, symptomIndex: number) => (
                          <span 
                            key={symptomIndex}
                            className="symptom-stamp text-white text-sm px-3 py-1 rounded-full"
                            data-testid={`symptom-tag-${index}-${symptomIndex}`}
                          >
                            {symptom}
                          </span>
                        ))}
                      </div>

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
    </div>
  );
}
