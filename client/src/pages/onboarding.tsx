import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import ZebbyAvatar from "@/components/zebby-avatar";
import { Heart, Users, TrendingUp, ArrowLeft, ArrowRight, CheckCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useProfile } from "@/hooks/useProfile";

const STEPS = [
  { id: "welcome", title: "Welcome to Zebby's World" },
  { id: "about-eds", title: "Understanding EDS" },
  { id: "your-eds", title: "Your EDS Journey" },
  { id: "avatar", title: "Choose your Zebby" },
  { id: "symptoms", title: "Your Symptoms" },
  { id: "goals", title: "Your Goals" },
  { id: "complete", title: "All Set!" },
];

const AVATARS = [
  { key: "zebby_classic", label: "Zebby", emoji: "🦓", vibe: "Classic & grounded" },
  { key: "zebby_cozy", label: "Cozy Zebby", emoji: "🧣", vibe: "Warm & soft days" },
  { key: "zebby_spoonie", label: "Spoonie Zebby", emoji: "🥄", vibe: "Pacing energy" },
  { key: "zebby_sparkle", label: "Sparkle Zebby", emoji: "✨", vibe: "For the bright days" },
  { key: "zebby_sleepy", label: "Sleepy Zebby", emoji: "🌙", vibe: "Rest forward" },
  { key: "zebby_brave", label: "Brave Zebby", emoji: "💪", vibe: "Flare warrior" },
];

const EDS_TYPES = [
  { value: "hEDS", label: "Hypermobile EDS (hEDS)", description: "Most common type, affects joints and skin" },
  { value: "cEDS", label: "Classical EDS (cEDS)", description: "Affects skin and joints significantly" },
  { value: "vEDS", label: "Vascular EDS (vEDS)", description: "Affects blood vessels and organs" },
  { value: "suspected", label: "Suspected EDS", description: "Symptoms present, awaiting confirmation" },
  { value: "other_rare_condition", label: "Other Rare Condition", description: "Similar connective tissue disorder" },
];

const COMMON_SYMPTOMS = [
  "Joint Pain", "Joint Hypermobility", "Chronic Fatigue", "POTS", "Chronic Pain",
  "Easy Bruising", "Skin Hyperextensibility", "Poor Wound Healing", "Headaches",
  "Digestive Issues", "Sleep Problems", "Brain Fog", "Heart Palpitations",
];

const EXPERIENCE_LEVELS = [
  { value: "new_to_eds", label: "New to EDS", description: "Recently diagnosed or just learning" },
  { value: "learning_to_manage", label: "Learning to Manage", description: "Know the basics, working on management" },
  { value: "experienced", label: "Experienced", description: "Comfortable managing my condition" },
];

const DAILY_GOALS_OPTIONS = [
  "Track my symptoms", "Monitor POTS episodes", "Find helpful products", 
  "Connect with Zebby AI", "Export health data", "Understand my patterns",
  "Manage pain levels", "Track energy levels", "Monitor sleep quality",
];

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { profile, isLoading } = useProfile();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    edsType: "",
    diagnosisYear: new Date().getFullYear(),
    primarySymptoms: [] as string[],
    experienceLevel: "",
    dailyGoals: [] as string[],
    avatarKey: "zebby_classic",
    firstName: "",
    lastName: "",
  });

  // Redirect if user has already completed onboarding
  useEffect(() => {
    if (!isLoading && profile && profile.onboardingCompleted) {
      setLocation("/");
    }
  }, [profile, isLoading, setLocation]);

  // Pre-fill first/last name from what we already have so we don't blank it out.
  useEffect(() => {
    if (profile && (profile.firstName || profile.lastName)) {
      setFormData((prev) => ({
        ...prev,
        firstName: prev.firstName || profile.firstName || "",
        lastName: prev.lastName || profile.lastName || "",
      }));
    }
  }, [profile]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      // Don't clobber the name set at signup with empty strings.
      const payload: Record<string, any> = { ...data, onboardingCompleted: true };
      if (payload.firstName === "" || payload.firstName == null) delete payload.firstName;
      if (payload.lastName === "" || payload.lastName == null) delete payload.lastName;
      return apiRequest('PUT', '/api/user/profile', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      toast({
        title: "Welcome to Zebby's World!",
        description: "Your profile has been set up successfully.",
      });
      
      // Use a short delay to ensure cache invalidation completes
      setTimeout(() => {
        // Force redirect to dashboard using window.location as backup
        setLocation("/");
        // Fallback to ensure redirect happens
        setTimeout(() => {
          if (window.location.pathname === "/onboarding") {
            window.location.href = "/";
          }
        }, 100);
      }, 100);
    },
    onError: (error) => {
      console.error("Failed to complete onboarding:", error);
      toast({
        title: "Error",
        description: "Failed to complete setup. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      updateProfileMutation.mutate(formData);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const updateFormData = (updates: Partial<typeof formData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const toggleSymptom = (symptom: string) => {
    updateFormData({
      primarySymptoms: formData.primarySymptoms.includes(symptom)
        ? formData.primarySymptoms.filter(s => s !== symptom)
        : [...formData.primarySymptoms, symptom]
    });
  };

  const toggleGoal = (goal: string) => {
    updateFormData({
      dailyGoals: formData.dailyGoals.includes(goal)
        ? formData.dailyGoals.filter(g => g !== goal)
        : [...formData.dailyGoals, goal]
    });
  };

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  const renderStepContent = () => {
    switch (STEPS[currentStep].id) {
      case "welcome":
        return (
          <div className="text-center space-y-6">
            <ZebbyAvatar size="large" className="mx-auto" />
            <div className="space-y-4">
              <h2 className="text-3xl font-bold text-foreground">Welcome to Zebby's World</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                You are understood here. I'm Zebby, your AI companion designed specifically for people with 
                EDS and rare conditions. Let me help you set up your personalized experience.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6 mt-8">
              <Card className="text-center">
                <CardContent className="pt-6">
                  <Heart className="w-12 h-12 text-primary mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">Empathetic Support</h3>
                  <p className="text-sm text-muted-foreground">Get understanding responses to your symptoms and experiences</p>
                </CardContent>
              </Card>
              <Card className="text-center">
                <CardContent className="pt-6">
                  <TrendingUp className="w-12 h-12 text-primary mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">Track Patterns</h3>
                  <p className="text-sm text-muted-foreground">Discover insights about your symptoms and health patterns</p>
                </CardContent>
              </Card>
              <Card className="text-center">
                <CardContent className="pt-6">
                  <Users className="w-12 h-12 text-primary mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">EDS Community</h3>
                  <p className="text-sm text-muted-foreground">Access curated products and reviews from the EDS community</p>
                </CardContent>
              </Card>
            </div>
          </div>
        );

      case "about-eds":
        return (
          <div className="space-y-6">
            <div className="text-center space-y-4">
              <h2 className="text-3xl font-bold text-foreground">Understanding EDS</h2>
              <p className="text-lg text-muted-foreground">
                Ehlers-Danlos Syndrome affects everyone differently, but you're not alone in this journey.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Heart className="w-5 h-5 text-primary" />
                    Why Zebby's World?
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">• Designed specifically for EDS and rare conditions</p>
                  <p className="text-sm">• AI trained to understand your unique symptoms</p>
                  <p className="text-sm">• Community-driven product recommendations</p>
                  <p className="text-sm">• Export data for medical appointments</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    You Are Not Alone
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">• Join thousands of others with EDS</p>
                  <p className="text-sm">• Share experiences through product reviews</p>
                  <p className="text-sm">• Get validated in your health journey</p>
                  <p className="text-sm">• Access community-tested products</p>
                </CardContent>
              </Card>
            </div>
          </div>
        );

      case "your-eds":
        return (
          <div className="space-y-6">
            <div className="text-center space-y-4">
              <h2 className="text-3xl font-bold text-foreground">Tell Me About Your EDS Journey</h2>
              <p className="text-lg text-muted-foreground">
                This helps me provide more personalized support and recommendations.
              </p>
            </div>

            <div className="space-y-8">
              <div className="space-y-4">
                <Label className="text-lg font-medium">What type of EDS do you have?</Label>
                <RadioGroup value={formData.edsType} onValueChange={(value) => updateFormData({ edsType: value })}>
                  {EDS_TYPES.map((type) => (
                    <div key={type.value} className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50">
                      <RadioGroupItem value={type.value} id={type.value} className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor={type.value} className="font-medium cursor-pointer">
                          {type.label}
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">{type.description}</p>
                      </div>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-4">
                <Label className="text-lg font-medium">When were you diagnosed?</Label>
                <div className="space-y-2">
                  <Label htmlFor="diagnosis-year" className="text-sm">Year (approximate is fine)</Label>
                  <Input
                    id="diagnosis-year"
                    type="number"
                    min="1950"
                    max={new Date().getFullYear()}
                    value={formData.diagnosisYear}
                    onChange={(e) => updateFormData({ diagnosisYear: parseInt(e.target.value) })}
                    placeholder="e.g., 2020"
                    data-testid="input-diagnosis-year"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <Label className="text-lg font-medium">How experienced are you with managing EDS?</Label>
                <RadioGroup value={formData.experienceLevel} onValueChange={(value) => updateFormData({ experienceLevel: value })}>
                  {EXPERIENCE_LEVELS.map((level) => (
                    <div key={level.value} className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50">
                      <RadioGroupItem value={level.value} id={level.value} className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor={level.value} className="font-medium cursor-pointer">
                          {level.label}
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">{level.description}</p>
                      </div>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </div>
          </div>
        );

      case "avatar":
        return (
          <div className="space-y-6">
            <div className="text-center space-y-4">
              <h2 className="text-3xl font-bold text-foreground">Choose your Zebby</h2>
              <p className="text-lg text-muted-foreground">
                Pick the vibe that feels right today — you can switch anytime.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="first-name" className="text-sm">First name</Label>
                <Input
                  id="first-name"
                  value={formData.firstName}
                  onChange={(e) => updateFormData({ firstName: e.target.value })}
                  className="mt-1 rounded-xl"
                  placeholder="What should Zebby call you?"
                  data-testid="input-onboarding-first"
                />
              </div>
              <div>
                <Label htmlFor="last-name" className="text-sm">Last name (optional)</Label>
                <Input
                  id="last-name"
                  value={formData.lastName}
                  onChange={(e) => updateFormData({ lastName: e.target.value })}
                  className="mt-1 rounded-xl"
                  data-testid="input-onboarding-last"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
              {AVATARS.map((a) => {
                const active = formData.avatarKey === a.key;
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => updateFormData({ avatarKey: a.key })}
                    className={`rounded-2xl p-5 text-center border transition-all flex flex-col items-center gap-2 ${
                      active
                        ? "border-primary bg-primary/5 shadow-md scale-[1.02]"
                        : "border-border hover:bg-muted/50"
                    }`}
                    data-testid={`avatar-${a.key}`}
                  >
                    <ZebbyAvatar
                      size="medium"
                      variant={a.key as any}
                      followUser={false}
                      showBadge
                    />
                    <div className="font-semibold text-sm">{a.label}</div>
                    <div className="text-xs text-muted-foreground">{a.vibe}</div>
                  </button>
                );
              })}
            </div>
          </div>
        );

      case "symptoms":
        return (
          <div className="space-y-6">
            <div className="text-center space-y-4">
              <h2 className="text-3xl font-bold text-foreground">Your Primary Symptoms</h2>
              <p className="text-lg text-muted-foreground">
                Select the symptoms you experience most frequently. This helps personalize your tracking.
              </p>
            </div>

            <div className="space-y-4">
              <Label className="text-lg font-medium">Choose your most common symptoms:</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {COMMON_SYMPTOMS.map((symptom) => (
                  <div key={symptom} className="flex items-center space-x-2">
                    <Checkbox
                      id={symptom}
                      checked={formData.primarySymptoms.includes(symptom)}
                      onCheckedChange={() => toggleSymptom(symptom)}
                      data-testid={`checkbox-${symptom.toLowerCase().replace(/\s+/g, '-')}`}
                    />
                    <Label 
                      htmlFor={symptom} 
                      className="text-sm cursor-pointer"
                    >
                      {symptom}
                    </Label>
                  </div>
                ))}
              </div>
              
              <div className="mt-6">
                <p className="text-sm text-muted-foreground">
                  Selected: {formData.primarySymptoms.length} symptoms
                  {formData.primarySymptoms.length === 0 && " (You can always add more later)"}
                </p>
              </div>
            </div>
          </div>
        );

      case "goals":
        return (
          <div className="space-y-6">
            <div className="text-center space-y-4">
              <h2 className="text-3xl font-bold text-foreground">Your Daily Goals</h2>
              <p className="text-lg text-muted-foreground">
                What would you like to focus on with Zebby's World? Select what matters most to you.
              </p>
            </div>

            <div className="space-y-4">
              <Label className="text-lg font-medium">I want to use Zebby's World to:</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {DAILY_GOALS_OPTIONS.map((goal) => (
                  <div key={goal} className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50">
                    <Checkbox
                      id={goal}
                      checked={formData.dailyGoals.includes(goal)}
                      onCheckedChange={() => toggleGoal(goal)}
                      data-testid={`checkbox-${goal.toLowerCase().replace(/\s+/g, '-')}`}
                    />
                    <Label 
                      htmlFor={goal} 
                      className="text-sm cursor-pointer flex-1"
                    >
                      {goal}
                    </Label>
                  </div>
                ))}
              </div>
              
              <div className="mt-6">
                <p className="text-sm text-muted-foreground">
                  Selected: {formData.dailyGoals.length} goals
                  {formData.dailyGoals.length === 0 && " (Choose what feels right for you)"}
                </p>
              </div>
            </div>
          </div>
        );

      case "complete":
        return (
          <div className="text-center space-y-6">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
            <div className="space-y-4">
              <h2 className="text-3xl font-bold text-foreground">You're All Set!</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Welcome to your personalized EDS management journey. I'm here to support you every step of the way.
              </p>
            </div>
            
            <Card className="max-w-2xl mx-auto">
              <CardHeader>
                <CardTitle className="flex items-center justify-center gap-2">
                  <ZebbyAvatar size="small" />
                  What's Next?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="text-left">
                    <h4 className="font-semibold mb-2">Start Tracking</h4>
                    <p className="text-sm text-muted-foreground">Log your first symptoms and get personalized insights from Zebby.</p>
                  </div>
                  <div className="text-left">
                    <h4 className="font-semibold mb-2">Explore Products</h4>
                    <p className="text-sm text-muted-foreground">Browse EDS-specific products reviewed by the community.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  const canProceed = () => {
    switch (STEPS[currentStep].id) {
      case "your-eds":
        return formData.edsType && formData.experienceLevel;
      case "symptoms":
        return true; // Optional
      case "goals":
        return true; // Optional
      default:
        return true;
    }
  };

  return (
    <div className="min-h-screen sky-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Progress Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-foreground">Setup Your Profile</h1>
            <span className="text-sm text-muted-foreground">
              Step {currentStep + 1} of {STEPS.length}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-sm text-muted-foreground mt-2">{STEPS[currentStep].title}</p>
        </div>

        {/* Step Content */}
        <Card className="mb-6 rounded-3xl border-0 shadow-zebby">
          <CardContent className="p-6 md:p-8">
            {renderStepContent()}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between gap-3 pb-10">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0}
            className="flex items-center gap-2 rounded-full"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          <Button
            onClick={handleNext}
            disabled={!canProceed() || updateProfileMutation.isPending}
            className="flex items-center gap-2 rounded-full px-6"
            data-testid="button-next"
          >
            {updateProfileMutation.isPending
              ? "Setting up..."
              : currentStep === STEPS.length - 1
                ? "Complete setup"
                : "Continue"}
            {currentStep < STEPS.length - 1 && <ArrowRight className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}