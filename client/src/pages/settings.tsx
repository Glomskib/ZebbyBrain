import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Crown, Check, X, Loader2, Download, LogIn } from "lucide-react";
import { ExportSection } from "@/components/ExportSection";
import { DataRetentionSection } from "@/components/DataRetentionSection";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { AccountManagement } from "@/components/AccountManagement";

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

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your Zebby account and subscription
        </p>
      </div>

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
  );
}