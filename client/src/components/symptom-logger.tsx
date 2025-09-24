import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import ZebbyAvatar from "@/components/zebby-avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { X } from "lucide-react";

interface SymptomLoggerProps {
  isOpen: boolean;
  onClose: () => void;
}

const COMMON_SYMPTOMS = [
  { icon: "🦴", name: "Joint Pain", testId: "joint-pain" },
  { icon: "😴", name: "Fatigue", testId: "fatigue" },
  { icon: "🧠", name: "Brain Fog", testId: "brain-fog" },
  { icon: "💓", name: "Heart Rate", testId: "heart-rate" },
  { icon: "🥵", name: "Heat Intolerance", testId: "heat-intolerance" },
  { icon: "🤸", name: "Joint Instability", testId: "joint-instability" },
  { icon: "😵", name: "Dizziness", testId: "dizziness" },
  { icon: "🤕", name: "Headache", testId: "headache" },
];

export default function SymptomLogger({ isOpen, onClose }: SymptomLoggerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [customSymptom, setCustomSymptom] = useState("");
  const [intensity, setIntensity] = useState(5);
  const [notes, setNotes] = useState("");
  const [timestamp, setTimestamp] = useState(
    new Date().toISOString().slice(0, 16) // Format for datetime-local
  );

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

  const resetForm = () => {
    setSelectedSymptoms([]);
    setCustomSymptom("");
    setIntensity(5);
    setNotes("");
    setTimestamp(new Date().toISOString().slice(0, 16));
  };

  const toggleSymptom = (symptomName: string) => {
    setSelectedSymptoms(prev => 
      prev.includes(symptomName) 
        ? prev.filter(s => s !== symptomName)
        : [...prev, symptomName]
    );
  };

  const addCustomSymptom = () => {
    if (customSymptom.trim() && !selectedSymptoms.includes(customSymptom.trim())) {
      setSelectedSymptoms(prev => [...prev, customSymptom.trim()]);
      setCustomSymptom("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (selectedSymptoms.length === 0) {
      toast({
        title: "Please select at least one symptom",
        variant: "destructive",
      });
      return;
    }

    // Convert datetime-local string to proper ISO string
    const isoTimestamp = new Date(timestamp).toISOString();
    
    createSymptomLogMutation.mutate({
      symptoms: selectedSymptoms,
      intensity,
      notes: notes.trim() || null,
      timestamp: isoTimestamp,
    });
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
                {COMMON_SYMPTOMS.map(({ icon, name, testId }) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleSymptom(name)}
                    className={`p-3 text-center rounded-lg border transition-colors ${
                      selectedSymptoms.includes(name)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary hover:bg-primary/5"
                    }`}
                    data-testid={`symptom-${testId}`}
                  >
                    <div className="text-xl mb-1">{icon}</div>
                    <div className="text-sm">{name}</div>
                  </button>
                ))}
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

              {/* Selected Symptoms Display */}
              {selectedSymptoms.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {selectedSymptoms.map((symptom, index) => (
                    <Badge
                      key={symptom}
                      variant="secondary"
                      className="flex items-center gap-1"
                      data-testid={`selected-symptom-${index}`}
                    >
                      {symptom}
                      <button
                        type="button"
                        onClick={() => toggleSymptom(symptom)}
                        className="ml-1 hover:text-destructive"
                        data-testid={`remove-symptom-${index}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            
            {/* Intensity Scale */}
            <div>
              <Label className="text-base font-medium text-foreground mb-3 block">
                How intense is it? ({intensity}/10)
              </Label>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">Mild</span>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={intensity}
                  onChange={(e) => setIntensity(parseInt(e.target.value))}
                  className="flex-1 accent-primary"
                  data-testid="slider-intensity"
                />
                <span className="text-sm text-muted-foreground">Severe</span>
                <span className="text-sm font-medium text-foreground w-8" data-testid="text-intensity-value">
                  {intensity}
                </span>
              </div>
            </div>
            
            {/* Notes */}
            <div>
              <Label className="text-base font-medium text-foreground mb-3 block">
                Tell me more about how you're feeling:
              </Label>
              <Textarea
                rows={4}
                placeholder="I'm here to listen... What's going on with your body today?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="resize-none"
                data-testid="textarea-notes"
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
                type="submit"
                disabled={createSymptomLogMutation.isPending || selectedSymptoms.length === 0}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                data-testid="button-submit"
              >
                {createSymptomLogMutation.isPending ? "Sharing..." : "Share with Zebby"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
