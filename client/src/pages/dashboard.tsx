import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import Navigation from "@/components/navigation";
import ZebbyAvatar from "@/components/zebby-avatar";
import SymptomLogger from "@/components/symptom-logger";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { BarChart3, Heart, Sparkles, TrendingUp, Users, Package, MessageCircle, HeartHandshake, Moon, Route as RouteIcon, Stethoscope, Gem, Gift, ShoppingBag } from "lucide-react";
import { Link } from "wouter";
import { L } from "@/i18n/labels";

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
        window.location.href = "/login";
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

  // Fetch personalized insight
  const { data: insightData } = useQuery({
    queryKey: ["/api/insights"],
    enabled: isAuthenticated,
    retry: false,
  });

  // Fetch AI interactions
  const { data: aiInteractions } = useQuery({
    queryKey: ["/api/ai-interactions"],
    enabled: isAuthenticated,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
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
  const recentLogs = (symptomLogs as any)?.slice(0, 7) || [];
  const totalReflections = (aiInteractions as any)?.length || 0;
  const trackingStreak = Math.min(recentLogs.length, 7);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8">
        {/* Hero Section with Gradient */}
        <div className="mb-8">
          <div className="zebby-gradient rounded-3xl p-6 md:p-10 text-white shadow-zebby-lg relative overflow-hidden">
            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-5">
              <ZebbyAvatar size="large" className="shrink-0" showBadge />
              <div className="flex-1">
                <p className="text-white/80 text-sm mb-1">Hi {firstName} 👋</p>
                <h1 className="text-3xl md:text-4xl font-bold mb-2" data-testid="text-welcome">
                  How are you feeling today?
                </h1>
                <p className="text-white/90 text-base md:text-lg mb-5 max-w-2xl">
                  You're doing your best — remember to pace like a pro. 💙
                </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => setShowSymptomLogger(true)}
                  className="bg-white text-primary font-semibold hover:bg-white/95 rounded-2xl px-6 py-6 text-base shadow-lg"
                  data-testid="button-log-symptoms"
                >
                  Log today's symptoms
                </Button>
                <Link href="/ask-zebby">
                  <Button
                    className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white font-semibold rounded-2xl px-6 py-6 text-base border border-white/30"
                    data-testid="button-ask-zebby"
                  >
                    Talk to Zebby
                  </Button>
                </Link>
              </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="rounded-2xl shadow-zebby border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground font-medium">Pain</span>
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="text-3xl font-bold text-foreground">
                {recentLogs[0]?.painLevel || '–'}/10
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-zebby border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground font-medium">Fatigue</span>
                <Sparkles className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="text-3xl font-bold text-foreground capitalize">
                {recentLogs[0]?.fatigue || 'None'}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-zebby border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground font-medium">Active streak</span>
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="text-3xl font-bold text-foreground" data-testid="text-tracking-streak">
                {trackingStreak} days
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-zebby border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground font-medium">Reflections sent</span>
                <Heart className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="text-3xl font-bold text-foreground" data-testid="text-total-reflections">
                {totalReflections}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Tracker Card */}
          <Card className="rounded-3xl shadow-zebby border-0">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-2xl zebby-gradient-subtle flex items-center justify-center">
                  <BarChart3 className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-xl">{L.tracker}</CardTitle>
              </div>
              <CardDescription className="text-base">
                Quick-log pain (0–10), fatigue, joints, mood, and notes. Auto-suggests patterns after 3+ days.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => setShowSymptomLogger(true)}
                className="bg-foreground text-white hover:bg-foreground/90 rounded-2xl font-semibold px-8 py-6"
                data-testid="button-open-tracker"
              >
                Open Tracker
              </Button>
            </CardContent>
          </Card>

          {/* Ask Zebby Card */}
          <Card className="rounded-3xl shadow-zebby border-0">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-2xl zebby-gradient-subtle flex items-center justify-center">
                  <MessageCircle className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-xl">{L.askZebby}</CardTitle>
              </div>
              <CardDescription className="text-base">
                Bite-sized guidance for flares, pacing, and appointments. Empathy-first answers with sources.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/ask-zebby">
                <Button 
                  className="bg-foreground text-white hover:bg-foreground/90 rounded-2xl font-semibold px-8 py-6"
                  data-testid="button-ask-question"
                >
                  Ask a Question
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Additional Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/pastures">
            <Card className="rounded-2xl shadow-zebby border-0 hover:shadow-zebby-lg transition-shadow cursor-pointer">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{L.pastures}</h3>
                    <p className="text-sm text-muted-foreground">Join community groups</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/spoonies">
            <Card className="rounded-2xl shadow-zebby border-0 hover:shadow-zebby-lg transition-shadow cursor-pointer">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
                    <Heart className="w-5 h-5 text-secondary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{L.spoonies}</h3>
                    <p className="text-sm text-muted-foreground">Share with trusted contacts</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/zebbys-pouch">
            <Card className="rounded-2xl shadow-zebby border-0 hover:shadow-zebby-lg transition-shadow cursor-pointer">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                    <Package className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{L.pouch}</h3>
                    <p className="text-sm text-muted-foreground">EDS-friendly products</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Expansion suite */}
        <div className="mt-6">
          <h2 className="text-sm uppercase tracking-wide text-muted-foreground mb-3">Explore</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { to: "/history", label: "History", sub: "Charts & trends", icon: <BarChart3 className="w-5 h-5" />, color: "bg-primary/10 text-primary" },
              { to: "/calm-corner", label: "Calm Corner", sub: "Grounding & pacing", icon: <HeartHandshake className="w-5 h-5" />, color: "bg-rose-100 text-rose-600" },
              { to: "/zzzebby-sounds", label: "Zzzebby Sounds", sub: "Sleep & sensory", icon: <Moon className="w-5 h-5" />, color: "bg-indigo-100 text-indigo-600" },
              { to: "/trusted-trail", label: "Trusted Trail", sub: "Guided tour", icon: <RouteIcon className="w-5 h-5" />, color: "bg-emerald-100 text-emerald-600" },
              { to: "/herd-insights", label: "Herd Insights", sub: "Patterns vs herd", icon: <TrendingUp className="w-5 h-5" />, color: "bg-violet-100 text-violet-600" },
              { to: "/doctor-prep", label: "Doctor Prep", sub: "Appointment briefs", icon: <Stethoscope className="w-5 h-5" />, color: "bg-sky-100 text-sky-600" },
              { to: "/zebbys-pouch", label: "Zebby's Pouch", sub: "Curated products", icon: <ShoppingBag className="w-5 h-5" />, color: "bg-teal-100 text-teal-600" },
              { to: "/settings/herd-rewards", label: "Rewards", sub: "Earn points", icon: <Gift className="w-5 h-5" />, color: "bg-fuchsia-100 text-fuchsia-600" },
              { to: "/zebby-plus", label: "Zebby+", sub: "Unlock more", icon: <Gem className="w-5 h-5" />, color: "bg-amber-100 text-amber-600" },
            ].map((t) => (
              <Link key={t.to} href={t.to}>
                <Card className="rounded-2xl shadow-zebby border-0 hover:shadow-zebby-lg transition-shadow cursor-pointer h-full">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.color}`}>
                      {t.icon}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground text-sm truncate">{t.label}</h3>
                      <p className="text-xs text-muted-foreground truncate">{t.sub}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Insight Card */}
        {(insightData as any)?.insight && (
          <div className="mt-8">
            <Card className="rounded-3xl shadow-zebby border-0 bg-gradient-to-br from-white to-muted/30">
              <CardContent className="p-8">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl zebby-gradient flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-foreground mb-2">Insight</h3>
                    <p className="text-foreground/80 leading-relaxed" data-testid="text-personal-insight">
                      {(insightData as any).insight}
                    </p>
                    <Button 
                      className="mt-4 bg-foreground text-white hover:bg-foreground/90 rounded-2xl font-semibold"
                      data-testid="button-open-plan"
                    >
                      Open Plan
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
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
