import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import SymptomTracker from "@/pages/symptom-tracker";
import Marketplace from "@/pages/marketplace";
import ProductDetail from "@/pages/product-detail";
import Settings from "@/pages/settings";
import ImportSettings from "@/pages/ImportSettings";
import ImportReviewQueue from "@/pages/ImportReviewQueue";
import Onboarding from "@/pages/onboarding";
import NotFound from "@/pages/not-found";
import SharePage from "@/pages/share";
import GroupsDirectory from "@/pages/groups-directory";
import GroupHome from "@/pages/group-home";
import PersonalCircle from "@/pages/personal-circle";
import MemberDashboard from "@/pages/member-dashboard";

function Router() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { profile, isLoading: profileLoading, needsOnboarding } = useProfile();

  const isLoading = authLoading || (isAuthenticated && profileLoading);

  return (
    <Switch>
      {/* Routes available to all users */}
      <Route path="/marketplace" component={Marketplace} />
      <Route path="/product/:id" component={({ params }: { params: { id: string } }) => <ProductDetail productId={params.id} />} />
      <Route path="/share/:id" component={SharePage} />
      <Route path="/login" component={() => { window.location.href = '/api/login'; return null; }} />
      
      {/* Onboarding route - accessible to authenticated users */}
      {isAuthenticated && (
        <Route path="/onboarding" component={Onboarding} />
      )}
      
      {/* Authentication-dependent routes */}
      {isLoading || !isAuthenticated ? (
        <Route path="/" component={Landing} />
      ) : needsOnboarding ? (
        /* Redirect to onboarding for users who haven't completed it */
        <>
          <Route path="/" component={() => { window.location.href = '/onboarding'; return null; }} />
          <Route path="/circle" component={() => { window.location.href = '/onboarding'; return null; }} />
          <Route path="/member-dashboard" component={() => { window.location.href = '/onboarding'; return null; }} />
          <Route path="/tracker" component={() => { window.location.href = '/onboarding'; return null; }} />
          <Route path="/groups" component={() => { window.location.href = '/onboarding'; return null; }} />
          <Route path="/groups/:slug" component={() => { window.location.href = '/onboarding'; return null; }} />
          <Route path="/settings" component={() => { window.location.href = '/onboarding'; return null; }} />
          <Route path="/import" component={() => { window.location.href = '/onboarding'; return null; }} />
        </>
      ) : (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/tracker" component={SymptomTracker} />
          <Route path="/groups" component={GroupsDirectory} />
          <Route path="/groups/:slug" component={GroupHome} />
          <Route path="/circle" component={PersonalCircle} />
          <Route path="/member-dashboard" component={MemberDashboard} />
          <Route path="/settings" component={Settings} />
          <Route path="/import" component={ImportSettings} />
          <Route path="/import/review" component={ImportReviewQueue} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
