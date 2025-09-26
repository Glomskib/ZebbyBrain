import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

export interface UserProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  onboardingCompleted: boolean | null;
  edsType: string | null;
  diagnosisYear: number | null;
  primarySymptoms: string[] | null;
  experienceLevel: string | null;
  dailyGoals: string[] | null;
}

export function useProfile() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const { data: profile, isLoading: profileLoading, error } = useQuery<UserProfile>({
    queryKey: ["/api/user/profile"],
    enabled: isAuthenticated && !authLoading,
    retry: false,
  });

  return {
    profile,
    isLoading: authLoading || profileLoading,
    isError: !!error,
    error,
    needsOnboarding: profile && !profile.onboardingCompleted,
    hasProfile: !!profile,
  };
}