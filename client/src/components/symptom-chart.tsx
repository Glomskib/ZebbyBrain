import { useMemo } from "react";

interface SymptomChartProps {
  symptoms: Array<{
    symptoms: string[];
    intensity: number;
    timestamp: string;
  }>;
}

export default function SymptomChart({ symptoms }: SymptomChartProps) {
  const chartData = useMemo(() => {
    // Get all unique symptoms
    const allSymptoms = new Set<string>();
    symptoms.forEach(log => {
      log.symptoms.forEach(symptom => allSymptoms.add(symptom));
    });

    // Calculate average intensity for each symptom
    const symptomStats = Array.from(allSymptoms).map(symptom => {
      const occurrences = symptoms.filter(log => log.symptoms.includes(symptom));
      const avgIntensity = occurrences.reduce((sum, log) => sum + log.intensity, 0) / occurrences.length;
      
      return {
        name: symptom,
        average: Math.round(avgIntensity * 10) / 10,
        count: occurrences.length,
        percentage: Math.round((avgIntensity / 10) * 100)
      };
    });

    // Sort by average intensity descending
    return symptomStats.sort((a, b) => b.average - a.average);
  }, [symptoms]);

  if (chartData.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-2">📊</div>
        <p className="text-muted-foreground">
          No symptom data available yet. Start logging to see patterns!
        </p>
      </div>
    );
  }

  const getIntensityColor = (intensity: number) => {
    if (intensity <= 3) return "bg-secondary";
    if (intensity <= 6) return "bg-primary";
    return "bg-accent";
  };

  const getIntensityColorClass = (intensity: number) => {
    if (intensity <= 3) return "text-secondary";
    if (intensity <= 6) return "text-primary";
    return "text-accent";
  };

  return (
    <div className="space-y-4" data-testid="symptom-chart">
      {chartData.slice(0, 6).map((symptom, index) => (
        <div key={symptom.name} className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground font-medium" data-testid={`symptom-name-${index}`}>
              {symptom.name}
            </span>
            <div className="flex items-center gap-2">
              <span 
                className={`font-medium ${getIntensityColorClass(symptom.average)}`}
                data-testid={`symptom-average-${index}`}
              >
                {symptom.average}/10 avg
              </span>
              <span className="text-xs text-muted-foreground" data-testid={`symptom-count-${index}`}>
                ({symptom.count} logs)
              </span>
            </div>
          </div>
          
          <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
            <div 
              className={`h-3 rounded-full transition-all duration-500 ${getIntensityColor(symptom.average)}`}
              style={{ width: `${symptom.percentage}%` }}
              data-testid={`symptom-bar-${index}`}
            />
          </div>
        </div>
      ))}
      
      {chartData.length > 6 && (
        <div className="text-center pt-4">
          <p className="text-sm text-muted-foreground" data-testid="more-symptoms-indicator">
            +{chartData.length - 6} more symptoms tracked
          </p>
        </div>
      )}
      
      <div className="mt-6 pt-4 border-t border-border">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-2">
            Based on your last {symptoms.length} symptom log{symptoms.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </div>
  );
}
