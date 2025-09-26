import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import Navigation from "@/components/navigation";
import ZebbyAvatar from "@/components/zebby-avatar";
import SymptomChart from "@/components/symptom-chart";
import SymptomLogger from "@/components/symptom-logger";
import InsightCards from "@/components/insight-cards";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { BarChart3, Heart, Lightbulb, Star } from "lucide-react";

export default function Dashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();
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

  // Fetch AI interactions
  const { data: aiInteractions, isLoading: aiLoading } = useQuery({
    queryKey: ["/api/ai-interactions"],
    enabled: isAuthenticated,
    retry: false,
  });

  // Fetch personalized insight
  const { data: insightData } = useQuery({
    queryKey: ["/api/insights"],
    enabled: isAuthenticated,
    retry: false,
  });

  // Feedback mutation
  const feedbackMutation = useMutation({
    mutationFn: async ({ interactionId, feltUnderstood }: { interactionId: string, feltUnderstood: boolean }) => {
      return apiRequest('PUT', `/api/ai-interactions/${interactionId}/feedback`, { feltUnderstood });
    },
    onSuccess: () => {
      // Invalidate AI interactions to refresh the data
      queryClient.invalidateQueries({ queryKey: ["/api/ai-interactions"] });
      toast({
        title: "Thank you!",
        description: "Your feedback helps Zebby learn to support you better.",
      });
    },
    onError: (error) => {
      console.error("Failed to submit feedback:", error);
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFeedback = (interactionId: string, feltUnderstood: boolean) => {
    feedbackMutation.mutate({ interactionId, feltUnderstood });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center sky-background">
        <div className="text-center">
          <ZebbyAvatar size="medium" className="mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  const firstName = (user as any)?.firstName || "Friend";
  const recentLogs = (symptomLogs as any)?.slice(0, 5) || [];
  const recentInteractions = (aiInteractions as any)?.slice(0, 3) || [];

  // Calculate stats
  const trackingStreak = Math.min(recentLogs.length, 7);
  const totalReflections = (aiInteractions as any)?.length || 0;

  return (
    <div className="min-h-screen sky-background">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section with Zebby Avatar */}
        <div className="mb-8">
          <div className="bg-gradient-to-r from-primary to-secondary rounded-2xl p-8 text-white relative overflow-hidden">
            <div className="zebra-pattern absolute inset-0 opacity-20"></div>
            <div className="relative z-10 flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold mb-2" data-testid="text-welcome">
                  Good {getTimeOfDay()}, {firstName}! <Star className="inline w-6 h-6 text-yellow-400 ml-1" />
                </h2>
                <p className="text-white/90 text-lg mb-4">
                  How are you feeling today? I'm here to listen and understand.
                </p>
                <Button 
                  onClick={() => setShowSymptomLogger(true)}
                  className="bg-white text-primary font-medium hover:bg-white/90"
                  data-testid="button-log-symptoms"
                >
                  Log Today's Symptoms
                </Button>
              </div>
              <div className="hidden lg:block">
                <ZebbyAvatar size="large" />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground">Symptom Insights</h3>
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-primary" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-2xl font-bold text-foreground" data-testid="text-tracking-streak">
                  {trackingStreak} days
                </div>
                <div className="text-sm text-muted-foreground">Recent tracking activity</div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${Math.min(trackingStreak * 14.3, 100)}%` }}
                  ></div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground">Zebby's Reflections</h3>
                <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
                  <Heart className="w-5 h-5 text-accent" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-2xl font-bold text-foreground" data-testid="text-total-reflections">
                  {totalReflections}
                </div>
                <div className="text-sm text-muted-foreground">Validating insights received</div>
                <div className="text-xs text-accent font-medium">
                  {recentInteractions.length > 0 ? `+${recentInteractions.length} recent` : 'Start logging to get insights'}
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground">Personal Insight</h3>
                <div className="w-10 h-10 bg-secondary/10 rounded-lg flex items-center justify-center">
                  <Lightbulb className="w-5 h-5 text-secondary" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-foreground" data-testid="text-personal-insight">
                  {(insightData as any)?.insight || "Keep tracking to discover patterns and insights about your symptoms."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Insight Cards */}
        <InsightCards />

        {/* Recent AI Interactions and Symptom Patterns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <ZebbyAvatar size="small" />
                Recent Zebby Reflections
              </h3>
              
              <div className="space-y-4">
                {recentInteractions.length > 0 ? (
                  recentInteractions.map((interaction: any, index: number) => (
                    <div key={interaction.id || index} className="bg-muted/50 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <ZebbyAvatar size="small" />
                        <div className="flex-1">
                          <div className="text-sm text-muted-foreground mb-1">
                            {new Date(interaction.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </div>
                          <p className="text-foreground text-sm leading-relaxed" data-testid={`text-ai-reflection-${index}`}>
                            {interaction.response}
                          </p>
                          <div className="flex gap-2 mt-3">
                            <span className="symptom-stamp text-white text-xs px-2 py-1 rounded-full">
                              {interaction.sentiment || 'Supportive'}
                            </span>
                            <span className="bg-accent text-accent-foreground text-xs px-2 py-1 rounded-full">
                              Understood
                            </span>
                          </div>
                          
                          {/* Feeling Understood Feedback */}
                          {interaction.feltUnderstood === null && (
                            <div className="mt-4 p-3 bg-muted/30 rounded-lg border border-dashed border-muted-foreground/30">
                              <p className="text-sm text-muted-foreground mb-2">Did this reflection help you feel understood?</p>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleFeedback(interaction.id, true)}
                                  className="bg-green-600 hover:bg-green-700 text-white"
                                  data-testid={`button-feedback-yes-${index}`}
                                >
                                  Yes 💚
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleFeedback(interaction.id, false)}
                                  className="border-red-300 text-red-600 hover:bg-red-50"
                                  data-testid={`button-feedback-no-${index}`}
                                >
                                  Not quite 💔
                                </Button>
                              </div>
                            </div>
                          )}
                          
                          {/* Feedback Received */}
                          {interaction.feltUnderstood !== null && (
                            <div className="mt-3 text-xs text-muted-foreground">
                              {interaction.feltUnderstood ? 
                                "Thank you for your feedback! 💚" : 
                                "Thank you for your feedback. I'll keep learning to support you better. 💙"
                              }
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <ZebbyAvatar size="medium" />
                    <p className="text-muted-foreground mt-4">
                      Start logging symptoms to receive empathetic reflections from Zebby!
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Your Recent Patterns</h3>
              
              {symptomsLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Loading your patterns...</p>
                </div>
              ) : recentLogs.length > 0 ? (
                <SymptomChart symptoms={recentLogs} />
              ) : (
                <div className="text-center py-8">
                  <div className="mb-4">
                    <BarChart3 className="w-16 h-16 text-primary mx-auto" />
                  </div>
                  <p className="text-muted-foreground">
                    No symptom data yet. Start tracking to see your patterns!
                  </p>
                  <Button 
                    onClick={() => setShowSymptomLogger(true)}
                    className="mt-4 bg-primary hover:bg-primary/90"
                    data-testid="button-start-tracking"
                  >
                    Start Tracking
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
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

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
