import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Brain, Sparkles, Clock, Crown, BookOpen, TrendingUp, AlertCircle, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface RagAnswer {
  answer: string;
  disclaimer: string;
  sources: {
    edsKnowledge: number;
    userHistory: number;
  };
  usage: {
    queriesUsed: number;
    queriesLimit: number;
  };
}

interface BillingStatus {
  plan: string;
  planStatus: string;
  currentPeriodEnd: string | null;
}

interface HealthCheck {
  ok: boolean;
  model: string;
  dim: number;
}

export default function AskZebby() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<RagAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeWindow, setTimeWindow] = useState<"7d" | "30d" | "90d" | "up_to_now">("30d");

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

  // Check RAG health
  const { data: healthCheck } = useQuery<HealthCheck>({
    queryKey: ["/api/rag/health"],
    enabled: isAuthenticated,
    retry: false,
  });

  const ragEnabled = import.meta.env.VITE_FF_RAG === "true";

  // Ask question mutation
  const askMutation = useMutation({
    mutationFn: async () => {
      if (!question.trim()) {
        throw new Error("Please enter a question");
      }
      
      const response = await apiRequest("POST", "/api/rag/answer", {
        question: question.trim(),
        window: timeWindow,
      });
      
      return response.json();
    },
    onSuccess: (data: RagAnswer) => {
      setResult(data);
      setError(null);
      toast({
        title: "Answer received",
        description: `${data.usage.queriesLimit - data.usage.queriesUsed} queries remaining today`,
      });
    },
    onError: (err: any) => {
      const errorMessage = err.message || "Something went wrong. Please try again.";
      setError(errorMessage);
      setResult(null);
      
      if (errorMessage.includes("429") || errorMessage.includes("limit")) {
        toast({
          title: "Daily Limit Reached",
          description: "You've used all your free queries today. Upgrade to Zebby Plus for 100 queries/day.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    },
  });

  // Fetch billing status
  const { data: billingStatus } = useQuery<BillingStatus>({
    queryKey: ["/api/billing/status"],
    enabled: isAuthenticated,
    retry: false,
  });

  // Upgrade mutation
  const upgradeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/billing/create-checkout-session");
      const data = await response.json();
      
      if (data.test_mode) {
        throw new Error("Stripe integration requires valid API keys");
      }
      
      if (data.url) {
        window.location.href = data.url;
      }
      return data;
    },
    onError: (error: any) => {
      toast({
        title: "Upgrade Failed",
        description: error.message || "Please try again later",
        variant: "destructive",
      });
    },
  });

  const isPaidUser = billingStatus?.plan === "plus";
  const atLimit = result?.usage ? result.usage.queriesUsed >= result.usage.queriesLimit : false;

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center sky-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!ragEnabled) {
    return (
      <div className="min-h-screen sky-background">
        <Navigation />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Feature Not Available</h2>
                <p className="text-muted-foreground">
                  The EDS AI Brain is currently disabled. Please contact support for more information.
                </p>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen sky-background">
      <Navigation />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Brain className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Ask Zebby</h1>
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Get personalized answers about EDS using AI-powered knowledge combined with your health data
          </p>
        </div>

        {/* Query Status */}
        {result?.usage && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">
                    {result.usage.queriesLimit - result.usage.queriesUsed} queries remaining today
                  </span>
                </div>
                {!isPaidUser && (
                  <Badge variant="outline" className="gap-1" data-testid="badge-plan">
                    <Crown className="h-3 w-3" />
                    Free Plan
                  </Badge>
                )}
                {isPaidUser && (
                  <Badge className="gap-1" data-testid="badge-plan">
                    <Crown className="h-3 w-3" />
                    Plus Plan
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Upgrade Banner - Show when at limit */}
        {atLimit && !isPaidUser && (
          <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20" data-testid="card-upgrade-banner">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Crown className="h-6 w-6 text-yellow-600 dark:text-yellow-500 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-1">
                      You've reached your free daily limit
                    </h3>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      Upgrade to <strong>Zebby Plus</strong> for 100 questions/day and unlock premium support, unlimited AI insights, and more.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => upgradeMutation.mutate()}
                  disabled={upgradeMutation.isPending}
                  className="w-full sm:w-auto"
                  data-testid="button-upgrade"
                >
                  {upgradeMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Crown className="h-4 w-4 mr-2" />
                      Upgrade to Zebby Plus
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Question Form */}
        <Card>
          <CardHeader>
            <CardTitle>Your Question</CardTitle>
            <CardDescription>
              Ask anything about EDS symptoms, management, or get personalized insights
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Textarea
                placeholder="Example: What are common EDS symptoms? How can I manage my joint pain? What does my recent data show?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={4}
                className="resize-none"
                disabled={askMutation.isPending || atLimit}
                data-testid="textarea-question"
              />
            </div>

            {/* Time Window Selector */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Include my data from:</span>
              {[
                { value: "7d" as const, label: "Last 7 days" },
                { value: "30d" as const, label: "Last 30 days" },
                { value: "90d" as const, label: "Last 90 days" },
                { value: "up_to_now" as const, label: "All time" },
              ].map((option) => (
                <Button
                  key={option.value}
                  variant={timeWindow === option.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTimeWindow(option.value)}
                  disabled={askMutation.isPending || atLimit}
                  data-testid={`button-window-${option.value}`}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            <Button
              onClick={() => askMutation.mutate()}
              disabled={askMutation.isPending || atLimit || !question.trim()}
              className="w-full"
              size="lg"
              data-testid="button-ask"
            >
              {askMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Thinking...
                </>
              ) : (
                <>
                  <Brain className="h-4 w-4 mr-2" />
                  Ask Zebby
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Card className="border-destructive bg-destructive/5" data-testid="card-error">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                <div>
                  <h3 className="font-semibold text-destructive mb-1">Error</h3>
                  <p className="text-sm text-destructive/90">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Answer Display */}
        {result && (
          <div className="space-y-4">
            <Card data-testid="card-answer">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Answer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                  {result.answer}
                </p>
                
                <Separator />
                
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <p className="italic">{result.disclaimer}</p>
                </div>
              </CardContent>
            </Card>

            {/* Sources Card */}
            <Card data-testid="card-sources">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BookOpen className="h-5 w-5 text-primary" />
                  Sources Used
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <BookOpen className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">EDS Knowledge Base</p>
                      <p className="text-sm text-muted-foreground">
                        {result.sources.edsKnowledge} source{result.sources.edsKnowledge !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">Your Health Data</p>
                      <p className="text-sm text-muted-foreground">
                        {result.sources.userHistory} data point{result.sources.userHistory !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Health Check Info */}
        {healthCheck && (
          <Card className="border-muted">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>System Status: {healthCheck.ok ? "✓ Operational" : "⚠ Offline"}</span>
                <span>Model: {healthCheck.model}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
