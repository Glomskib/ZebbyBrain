import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useEffect } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import ZebbyChat from "@/components/ZebbyChat";
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
import ModQueue from "@/pages/mod-queue";
import PersonalCircle from "@/pages/personal-circle";
import MemberDashboard from "@/pages/member-dashboard";
import HerdRewards from "@/pages/herd-rewards";
import AskZebby from "@/pages/ask-zebby";

function Redirect({ from, to }: { from: string; to: string }) {
  const [, setLocation] = useLocation();
  
  useEffect(() => {
    const currentPath = window.location.pathname;
    const search = window.location.search;
    const hash = window.location.hash;
    
    // Replace the legacy path prefix with new path
    const newPath = currentPath.replace(new RegExp(`^${from}`), to);
    const fullUrl = `${newPath}${search}${hash}`;
    
    setLocation(fullUrl);
  }, [from, to, setLocation]);
  
  return null;
}

function Router() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { profile, isLoading: profileLoading, needsOnboarding } = useProfile();

  const isLoading = authLoading || (isAuthenticated && profileLoading);

  return (
    <Switch>
      {/* Legacy route redirects: OLD names → NEW Kickstarter names (preserves query params & hash) */}
      <Route path="/groups" component={() => <Redirect from="/groups" to="/pastures" />} />
      <Route path="/groups/:rest+" component={() => <Redirect from="/groups" to="/pastures" />} />
      <Route path="/circle" component={() => <Redirect from="/circle" to="/spoonies" />} />
      <Route path="/circle/:rest+" component={() => <Redirect from="/circle" to="/spoonies" />} />
      <Route path="/personal-circle" component={() => <Redirect from="/personal-circle" to="/spoonies" />} />
      <Route path="/personal-circle/:rest+" component={() => <Redirect from="/personal-circle" to="/spoonies" />} />
      <Route path="/marketplace" component={() => <Redirect from="/marketplace" to="/zebbys-pouch" />} />
      <Route path="/marketplace/:rest+" component={() => <Redirect from="/marketplace" to="/zebbys-pouch" />} />
      <Route path="/store" component={() => <Redirect from="/store" to="/zebbys-pouch" />} />
      <Route path="/store/:rest+" component={() => <Redirect from="/store" to="/zebbys-pouch" />} />
      
      {/* NEW canonical routes with Kickstarter naming */}
      <Route path="/zebbys-pouch" component={Marketplace} />
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
          <Route path="/spoonies" component={() => { window.location.href = '/onboarding'; return null; }} />
          <Route path="/member-dashboard" component={() => { window.location.href = '/onboarding'; return null; }} />
          <Route path="/tracker" component={() => { window.location.href = '/onboarding'; return null; }} />
          <Route path="/ask-zebby" component={() => { window.location.href = '/onboarding'; return null; }} />
          <Route path="/pastures" component={() => { window.location.href = '/onboarding'; return null; }} />
          <Route path="/pastures/:slug" component={() => { window.location.href = '/onboarding'; return null; }} />
          <Route path="/pastures/:slug/mod/reports" component={() => { window.location.href = '/onboarding'; return null; }} />
          <Route path="/settings" component={() => { window.location.href = '/onboarding'; return null; }} />
          <Route path="/settings/herd-rewards" component={() => { window.location.href = '/onboarding'; return null; }} />
          <Route path="/import" component={() => { window.location.href = '/onboarding'; return null; }} />
        </>
      ) : (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/tracker" component={SymptomTracker} />
          <Route path="/ask-zebby" component={AskZebby} />
          <Route path="/pastures" component={GroupsDirectory} />
          <Route path="/pastures/:slug/mod/reports" component={ModQueue} />
          <Route path="/pastures/:slug" component={GroupHome} />
          <Route path="/spoonies" component={PersonalCircle} />
          <Route path="/member-dashboard" component={MemberDashboard} />
          <Route path="/settings" component={Settings} />
          <Route path="/settings/herd-rewards" component={HerdRewards} />
          <Route path="/import" component={ImportSettings} />
          <Route path="/import/review" component={ImportReviewQueue} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { isAuthenticated } = useAuth();
  usePushNotifications(isAuthenticated);

  return (
    <>
      <Router />
      {/* Wave 1: Global Zebby Chat Avatar - Only show when authenticated */}
      {isAuthenticated && <ZebbyChat />}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
