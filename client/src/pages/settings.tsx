import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Crown, Check, X, Loader2, Download, LogIn, ArrowLeft, LogOut, Bell, Globe, Mail } from "lucide-react";
import { ExportSection } from "@/components/ExportSection";
import { DataRetentionSection } from "@/components/DataRetentionSection";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { AccountManagement } from "@/components/AccountManagement";
import ZebbyAvatar from "@/components/zebby-avatar";
import Navigation from "@/components/navigation";
import { Link } from "wouter";

interface BillingStatus {
  plan: string;
  planStatus: string;
  currentPeriodEnd: string | null;
}

export default function Settings() {
  const { toast } = useToast();
  const [isUpgrading, setIsUpgrading] = useState(false);
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  // Fetch billing status only if authenticated
  const { data: billingStatus, isLoading: billingLoading } = useQuery<BillingStatus>({
    queryKey: ['/api/billing/status'],
    retry: false,
    enabled: isAuthenticated, // Only fetch billing status if authenticated
  });

  // Create checkout session mutation
  const upgradeToPlusMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/billing/create-checkout-session");
      const data = await response.json();
      
      // Check if we're in test mode first
      if (data.test_mode) {
        console.log("Test mode detected:", data.message);
        return data;
      }
      
      // Only redirect for real Stripe checkout
      if (data.url && !data.test_mode) {
        window.location.href = data.url;
      }
      return data;
    },
    onSuccess: (data) => {
      if (data.test_mode) {
        toast({
          title: "Test Mode Active",
          description: "Stripe integration requires valid API keys for real payments.",
        });
        setIsUpgrading(false);
      } else {
        toast({
          title: "Redirecting to Stripe...",
          description: "You'll be redirected to complete your subscription.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Upgrade Failed",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
      setIsUpgrading(false);
    },
  });

  const handleUpgrade = () => {
    setIsUpgrading(true);
    upgradeToPlusMutation.mutate();
  };

  const isPlusUser = billingStatus?.plan === "plus" && billingStatus?.planStatus === "active";
  const periodEndDate = billingStatus?.currentPeriodEnd 
    ? new Date(billingStatus.currentPeriodEnd).toLocaleDateString()
    : null;

  if (authLoading || billingLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  const userTyped = user as any;
  const fullName =
    userTyped?.firstName && userTyped?.lastName
      ? `${userTyped.firstName} ${userTyped.lastName}`
      : userTyped?.firstName || userTyped?.email || "Your account";

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    queryClient.clear();
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="max-w-4xl mx-auto p-4 md:p-6 pb-24 md:pb-12 space-y-6">
        <Link href="/">
          <button
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground rounded-full px-3 py-1.5"
            data-testid="button-back-to-dashboard"
          >
            <ArrowLeft className="w-4 h-4" /> Back to dashboard
          </button>
        </Link>

        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Manage your Zebby account, preferences, and subscription.
          </p>
        </div>

        {/* Profile summary */}
        <Card className="rounded-2xl border-0 shadow-zebby" data-testid="card-profile">
          <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <ZebbyAvatar size="medium" showBadge />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-lg truncate" data-testid="text-profile-name">
                {fullName}
              </div>
              {userTyped?.email && (
                <div className="text-sm text-muted-foreground truncate flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" /> {userTyped.email}
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={isPlusUser ? "default" : "secondary"}>
                  {isPlusUser ? "Zebby+" : "Free plan"}
                </Badge>
                {userTyped?.edsType && <Badge variant="outline">{userTyped.edsType}</Badge>}
              </div>
            </div>
            <Button
              variant="outline"
              className="rounded-full shrink-0"
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-1.5" /> Log out
            </Button>
          </CardContent>
        </Card>

        {/* Preferences (placeholder, but visible + organized) */}
        <Card className="rounded-2xl border-0 shadow-zebby">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="w-4 h-4" /> Preferences
            </CardTitle>
            <CardDescription>Quick tweaks to how Zebby works for you.</CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-3 text-sm">
            <PrefRow icon={<Bell className="w-4 h-4" />} title="Reminders" body="Manage symptom + hydration nudges" cta="Open" href="/settings/herd-rewards" />
            <PrefRow icon={<Globe className="w-4 h-4" />} title="Language & timezone" body="English · auto-detected" cta="Soon" disabled />
            <PrefRow icon={<Crown className="w-4 h-4" />} title="Zebby+ subscription" body={isPlusUser ? "Active member" : "Upgrade for premium tools"} cta={isPlusUser ? "Manage" : "Upgrade"} href="/zebby-plus" />
            <PrefRow icon={<Download className="w-4 h-4" />} title="Export data" body="Download your symptom log" cta="See below" disabled />
          </CardContent>
        </Card>

      {/* Current Plan Status */}
      <Card data-testid="plan-status-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5" />
            Current Plan
          </CardTitle>
          <CardDescription>
            Your current subscription status and benefits
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">
                  {isPlusUser ? "Zebby Plus" : "Free Plan"}
                </span>
                <Badge 
                  variant={isPlusUser ? "default" : "secondary"}
                  data-testid="plan-badge"
                >
                  {isPlusUser ? "Active" : "Free"}
                </Badge>
              </div>
              {isPlusUser && periodEndDate && (
                <p className="text-sm text-muted-foreground">
                  Plus • renews on {periodEndDate}
                </p>
              )}
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">
                {isPlusUser ? "$15" : "$0"}
              </div>
              <div className="text-sm text-muted-foreground">
                {isPlusUser ? "per month" : "forever"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan Comparison */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Free Plan */}
        <Card className="relative">
          <CardHeader>
            <CardTitle>Free Plan</CardTitle>
            <CardDescription>Essential EDS tracking features</CardDescription>
            <div className="text-3xl font-bold">$0<span className="text-lg font-normal">/month</span></div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm">Unlimited symptom logging</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm">Basic AI reflections (3 per day)</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm">EDS marketplace access</span>
            </div>
            <div className="flex items-center gap-2">
              <X className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-400">Unlimited AI conversations</span>
            </div>
            <div className="flex items-center gap-2">
              <X className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-400">Advanced symptom analytics</span>
            </div>
            <div className="flex items-center gap-2">
              <X className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-400">Data export (CSV, PDF)</span>
            </div>
          </CardContent>
        </Card>

        {/* Plus Plan */}
        <Card className={`relative ${isPlusUser ? 'ring-2 ring-primary' : ''}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-yellow-500" />
              Zebby Plus
            </CardTitle>
            <CardDescription>Everything you need for comprehensive EDS management</CardDescription>
            <div className="text-3xl font-bold">$15<span className="text-lg font-normal">/month</span></div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm">Everything in Free</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm">Unlimited AI conversations</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm">Advanced symptom analytics</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm">Data export (CSV, PDF)</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm">Premium themes & customization</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm">Priority customer support</span>
            </div>
            
            <div className="pt-4">
              {isPlusUser ? (
                <Button disabled className="w-full" data-testid="current-plan-button">
                  <Crown className="h-4 w-4 mr-2" />
                  Current Plan
                </Button>
              ) : !isAuthenticated ? (
                <Button 
                  disabled 
                  variant="outline"
                  className="w-full"
                  data-testid="sign-in-to-upgrade-button"
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  Sign in to upgrade
                </Button>
              ) : (
                <Button 
                  onClick={handleUpgrade}
                  disabled={isUpgrading}
                  className="w-full"
                  data-testid="upgrade-button"
                >
                  {isUpgrading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Crown className="h-4 w-4 mr-2" />
                      Upgrade to Plus
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Success/Cancel Messages */}
      {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('purchase') === 'success' && (
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-green-800">
              <Check className="h-5 w-5" />
              <span className="font-semibold">Welcome to Zebby Plus!</span>
            </div>
            <p className="text-green-700 mt-1">
              Your subscription has been activated. You now have access to all premium features.
            </p>
          </CardContent>
        </Card>
      )}

      {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('purchase') === 'cancel' && (
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-yellow-800">
              <X className="h-5 w-5" />
              <span className="font-semibold">Upgrade Cancelled</span>
            </div>
            <p className="text-yellow-700 mt-1">
              No worries! You can upgrade to Zebby Plus anytime to unlock premium features.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Export Data Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Your Data
          </CardTitle>
          <CardDescription>
            Download your health data for personal records or sharing with healthcare providers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExportSection />
        </CardContent>
      </Card>

      {/* Data Retention Section */}
      <DataRetentionSection isAuthenticated={isAuthenticated} />

      {/* PWA Install */}
      <PWAInstallPrompt />

      {/* Account Management */}
      <Card>
        <CardHeader>
          <CardTitle>Account Management</CardTitle>
          <CardDescription>
            Manage your account data, backups, and account deletion
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AccountManagement />
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function PrefRow({
  icon,
  title,
  body,
  cta,
  href,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string;
  href?: string;
  disabled?: boolean;
}) {
  const inner = (
    <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{title}</div>
        <div className="text-xs text-muted-foreground truncate">{body}</div>
      </div>
      <span
        className={`text-xs rounded-full px-3 py-1 border ${
          disabled
            ? "border-border text-muted-foreground"
            : "border-primary/40 text-primary hover:bg-primary/10"
        }`}
      >
        {cta}
      </span>
    </div>
  );
  if (disabled || !href) return inner;
  return <Link href={href}>{inner}</Link>;
}