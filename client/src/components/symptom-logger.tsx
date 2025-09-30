import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import ZebbyAvatar from "@/components/zebby-avatar";
import { BodyPartSelector, type BodyPart, type Side } from "@/components/BodyPartSelector";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { X, Thermometer, Droplets, Heart, Utensils } from "lucide-react";

interface SymptomLoggerProps {
  isOpen: boolean;
  onClose: () => void;
}

const COMMON_SYMPTOMS = [
  { icon: "🦴", name: "Joint Pain", testId: "joint-pain" },
  { icon: "😴", name: "Fatigue", testId: "fatigue" },
  { icon: "🧠", name: "Brain Fog", testId: "brain-fog" },
  { icon: "💓", name: "Heart Palpitations", testId: "heart-palpitations" },
  { icon: "🥵", name: "Heat Intolerance", testId: "heat-intolerance" },
  { icon: "🤸", name: "Joint Instability", testId: "joint-instability" },
  { icon: "😵", name: "Dizziness", testId: "dizziness" },
  { icon: "🤕", name: "Headache", testId: "headache" },
];

interface SymptomRating {
  name: string;
  intensity: number;
  notes: string;
  bodyPart?: BodyPart | "";
  side?: Side;
}

export default function SymptomLogger({ isOpen, onClose }: SymptomLoggerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [symptomRatings, setSymptomRatings] = useState<SymptomRating[]>([]);
  const [customSymptom, setCustomSymptom] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");
  const [timestamp, setTimestamp] = useState(
    new Date().toISOString().slice(0, 16) // Format for datetime-local
  );
  const [waterIntakeToday, setWaterIntakeToday] = useState(0); // in ml
  const [sodiumIntakeToday, setSodiumIntakeToday] = useState(0); // in mg
  const [currentHeartRate, setCurrentHeartRate] = useState<number | null>(null);
  const [currentLocation, setCurrentLocation] = useState<string>("");

  const createSymptomLogMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/symptoms", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/symptoms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-interactions"] });
      toast({
        title: "Symptom logged successfully! 🦓",
        description: "Zebby is preparing a thoughtful reflection for you.",
      });
      onClose();
      resetForm();
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
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
      toast({
        title: "Failed to log symptom",
        description: "Please try again. If the problem persists, contact support.",
        variant: "destructive",
      });
    },
  });

  // Fetch today's water and sodium intake
  const { data: todayIntakes } = useQuery({
    queryKey: ["/api/daily-intakes"],
    enabled: isOpen,
  });

  useEffect(() => {
    if (todayIntakes) {
      setWaterIntakeToday((todayIntakes as any)?.waterMl || 0);
      setSodiumIntakeToday((todayIntakes as any)?.sodiumMg || 0);
    }
  }, [todayIntakes]);

  // Request geolocation for weather data
  useEffect(() => {
    if (isOpen && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation(`${position.coords.latitude},${position.coords.longitude}`);
        },
        () => {
          // Fallback to asking user for city if geolocation fails
          setCurrentLocation("Unknown");
        }
      );
    }
  }, [isOpen]);

  const resetForm = () => {
    setSymptomRatings([]);
    setCustomSymptom("");
    setSessionNotes("");
    setTimestamp(new Date().toISOString().slice(0, 16));
    setCurrentHeartRate(null);
  };

  const addSymptom = (symptomName: string) => {
    if (!symptomRatings.find(s => s.name === symptomName)) {
      setSymptomRatings(prev => [...prev, { name: symptomName, intensity: 5, notes: "", bodyPart: "", side: null }]);
    }
  };

  const removeSymptom = (symptomName: string) => {
    setSymptomRatings(prev => prev.filter(s => s.name !== symptomName));
  };

  const updateSymptomRating = (symptomName: string, field: 'intensity' | 'notes' | 'bodyPart' | 'side', value: number | string | BodyPart | Side | "" | null) => {
    console.log(`Updating symptom rating: ${symptomName}, field: ${field}, value: ${value}`);
    setSymptomRatings(prev => {
      const updated = prev.map(symptom => 
        symptom.name === symptomName 
          ? { ...symptom, [field]: value }
          : symptom
      );
      console.log('Updated symptom ratings:', JSON.stringify(updated, null, 2));
      return updated;
    });
  };

  const addCustomSymptom = () => {
    if (customSymptom.trim() && !symptomRatings.find(s => s.name === customSymptom.trim())) {
      setSymptomRatings(prev => [...prev, { name: customSymptom.trim(), intensity: 5, notes: "", bodyPart: "", side: null }]);
      setCustomSymptom("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (symptomRatings.length === 0) {
      toast({
        title: "Please select at least one symptom",
        variant: "destructive",
      });
      return;
    }

    // Force-sync React state from DOM values before submission
    // This handles cases where test automation sets DOM values but doesn't trigger React onChange
    const syncedSymptomEntries = symptomRatings.map((symptom, index) => {
      const sliderElement = document.querySelector(`[data-testid="slider-intensity-${index}"]`) as HTMLInputElement;
      const notesElement = document.querySelector(`[data-testid="textarea-symptom-notes-${index}"]`) as HTMLTextAreaElement;
      
      const domIntensity = sliderElement ? parseInt(sliderElement.value || sliderElement.defaultValue) : symptom.intensity;
      const domNotes = notesElement ? (notesElement.value || notesElement.defaultValue || "") : symptom.notes;
      
      console.log(`Symptom ${symptom.name} (index ${index}):`);
      console.log(`  React state intensity: ${symptom.intensity}`);
      console.log(`  DOM slider value: ${sliderElement?.value}, defaultValue: ${sliderElement?.defaultValue}`);
      console.log(`  Final intensity: ${domIntensity}`);
      
      return {
        symptomName: symptom.name,
        intensity: domIntensity,
        notes: domNotes,
        bodyPart: symptom.bodyPart || null,
        side: symptom.side || null,
      };
    });
    
    // Convert datetime-local string to proper ISO string
    const isoTimestamp = new Date(timestamp).toISOString();
    
    const payload = {
      timestamp: isoTimestamp,
      notes: sessionNotes.trim() || null,
      waterIntakeCurrentMl: waterIntakeToday,
      sodiumIntakeCurrentMg: sodiumIntakeToday,
      heartRateBpm: currentHeartRate,
      location: currentLocation,
      symptomEntries: syncedSymptomEntries,
    };
    
    console.log('Final payload:', JSON.stringify(payload, null, 2));
    
    createSymptomLogMutation.mutate(payload);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardContent className="p-0">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <ZebbyAvatar size="medium" />
              <h2 className="text-2xl font-semibold text-foreground">
                Tell Zebby How You're Feeling
              </h2>
            </div>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={onClose}
              data-testid="button-close-logger"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Symptom Selection */}
            <div>
              <Label className="text-base font-medium text-foreground mb-3 block">
                What symptoms are you experiencing?
              </Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                {COMMON_SYMPTOMS.map(({ icon, name, testId }) => {
                  const isSelected = symptomRatings.some(s => s.name === name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => isSelected ? removeSymptom(name) : addSymptom(name)}
                      className={`p-3 text-center rounded-lg border transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary hover:bg-primary/5"
                      }`}
                      data-testid={`symptom-${testId}`}
                    >
                      <div className="text-xl mb-1">{icon}</div>
                      <div className="text-sm">{name}</div>
                    </button>
                  );
                })}
              </div>

              {/* Custom Symptom Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add custom symptom..."
                  value={customSymptom}
                  onChange={(e) => setCustomSymptom(e.target.value)}
                  className="flex-1 px-3 py-2 bg-input border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                  data-testid="input-custom-symptom"
                />
                <Button
                  type="button"
                  onClick={addCustomSymptom}
                  disabled={!customSymptom.trim()}
                  className="bg-secondary hover:bg-secondary/90"
                  data-testid="button-add-custom"
                >
                  Add
                </Button>
              </div>

              {/* Selected Symptoms with Individual Ratings */}
              {symptomRatings.length > 0 && (
                <div className="space-y-4 mt-4">
                  <Separator />
                  <Label className="text-base font-medium text-foreground">Rate Each Symptom (1-10 scale)</Label>
                  {symptomRatings.map((symptomRating, index) => (
                    <Card key={symptomRating.name} className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium">{symptomRating.name}</h4>
                        <button
                          type="button"
                          onClick={() => removeSymptom(symptomRating.name)}
                          className="text-muted-foreground hover:text-destructive"
                          data-testid={`remove-symptom-${index}`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      
                      {/* Individual Symptom Intensity */}
                      <div className="mb-3">
                        <div className="flex items-center gap-4 mb-2">
                          <span className="text-sm text-muted-foreground">Mild</span>
                          <input
                            type="range"
                            min="1"
                            max="10"
                            value={symptomRating.intensity}
                            onChange={(e) => updateSymptomRating(symptomRating.name, 'intensity', parseInt(e.target.value))}
                            className="flex-1 accent-primary"
                            data-testid={`slider-intensity-${index}`}
                          />
                          <span className="text-sm text-muted-foreground">Severe</span>
                          <span className="text-sm font-medium text-foreground w-8" data-testid={`text-intensity-${index}`}>
                            {symptomRating.intensity}
                          </span>
                        </div>
                      </div>
                      
                      {/* Individual Symptom Notes */}
                      <Textarea
                        rows={2}
                        placeholder={`Specific notes about your ${symptomRating.name.toLowerCase()}...`}
                        value={symptomRating.notes}
                        onChange={(e) => updateSymptomRating(symptomRating.name, 'notes', e.target.value)}
                        className="resize-none text-sm"
                        data-testid={`textarea-symptom-notes-${index}`}
                      />

                      {/* Wave 1: Body Part Selector */}
                      <div className="mt-4 pt-4 border-t border-border">
                        <BodyPartSelector
                          value={symptomRating.bodyPart as BodyPart}
                          side={symptomRating.side}
                          onChange={(part) => updateSymptomRating(symptomRating.name, 'bodyPart', part)}
                          onSideChange={(side) => updateSymptomRating(symptomRating.name, 'side', side)}
                          showSide={true}
                        />
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
            
            {/* Contextual Data Display */}
            {symptomRatings.length > 0 && (
              <div className="bg-muted/30 rounded-lg p-4">
                <Label className="text-base font-medium text-foreground mb-3 block">
                  Contextual Data Being Captured
                </Label>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Thermometer className="w-4 h-4 text-orange-500" />
                    <span>Weather: Detecting...</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-blue-500" />
                    <span>Water: {waterIntakeToday}ml today</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-red-500" />
                    <span>Heart Rate: {currentHeartRate ? `${currentHeartRate} bpm` : 'Optional'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Utensils className="w-4 h-4 text-green-500" />
                    <span>Sodium: {sodiumIntakeToday}mg today</span>
                  </div>
                </div>
                
                {/* Optional Heart Rate Input */}
                <div className="mt-4">
                  <Label className="text-sm text-muted-foreground mb-2 block">
                    Current Heart Rate (optional)
                  </Label>
                  <input
                    type="number"
                    placeholder="e.g. 72"
                    min="30"
                    max="220"
                    value={currentHeartRate || ''}
                    onChange={(e) => setCurrentHeartRate(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-3 py-2 bg-input border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                    data-testid="input-heart-rate"
                  />
                </div>
              </div>
            )}
            
            {/* Session Notes */}
            <div>
              <Label className="text-base font-medium text-foreground mb-3 block">
                Overall session notes (optional):
              </Label>
              <Textarea
                rows={3}
                placeholder="Any additional context about how you're feeling overall today..."
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                className="resize-none"
                data-testid="textarea-session-notes"
              />
            </div>
            
            {/* Timestamp */}
            <div>
              <Label className="text-base font-medium text-foreground mb-3 block">
                When did this start?
              </Label>
              <input
                type="datetime-local"
                value={timestamp}
                onChange={(e) => setTimestamp(e.target.value)}
                className="w-full p-3 bg-input border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="input-timestamp"
              />
            </div>
            
            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose}
                className="flex-1"
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  console.log("=== DEBUG VALUES ===");
                  console.log("React state symptomRatings:", JSON.stringify(symptomRatings, null, 2));
                  symptomRatings.forEach((symptom, index) => {
                    const sliderElement = document.querySelector(`[data-testid="slider-intensity-${index}"]`) as HTMLInputElement;
                    console.log(`Slider ${index} (${symptom.name}):`);
                    console.log(`  React state: ${symptom.intensity}`);
                    console.log(`  DOM element:`, sliderElement);
                    console.log(`  DOM value: ${sliderElement?.value}`);
                    console.log(`  DOM defaultValue: ${sliderElement?.defaultValue}`);
                  });
                  console.log("=== END DEBUG ===");
                }}
                className="px-3"
                data-testid="button-debug"
              >
                Debug
              </Button>
              <Button 
                type="submit"
                disabled={createSymptomLogMutation.isPending || symptomRatings.length === 0}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                data-testid="button-submit"
              >
                {createSymptomLogMutation.isPending ? "Logging..." : "Log Symptoms"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
