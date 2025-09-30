import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Wave 3 - Multi-Entry: Flexible lookback windows
type RangeWindow = "7d" | "14d" | "30d" | "60d" | "90d" | "180d" | "365d" | "today" | "last_symptom" | "up_to_now";

interface ZebbyFindingsData {
  range: string;
  analysis: string;
  trendBullets: string[];
  actionIdeas: string[];
  disclaimer: string;
}

export default function ZebbyFindings() {
  const [selectedRange, setSelectedRange] = useState<RangeWindow>("30d");
  const [data, setData] = useState<ZebbyFindingsData | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/ai/insights", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ range: selectedRange }),
        });

        if (!response.ok) {
          if (response.status === 404) {
            toast({
              title: "Feature Disabled",
              description: "AI Trends is currently disabled.",
              variant: "destructive",
            });
            return;
          }
          throw new Error("Failed to load insights");
        }

        const json = await response.json();
        setData(json);
      } catch (error) {
        console.error("Error loading Zebby findings:", error);
        toast({
          title: "Error",
          description: "Failed to load AI insights. Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedRange, toast]);

  // Wave 3 - Multi-Entry: Window options with friendly labels
  const windows: { value: RangeWindow; label: string }[] = [
    { value: "7d", label: "7d" },
    { value: "14d", label: "14d" },
    { value: "30d", label: "30d" },
    { value: "60d", label: "60d" },
    { value: "90d", label: "90d" },
    { value: "180d", label: "180d" },
    { value: "365d", label: "365d" },
    { value: "today", label: "Today" },
    { value: "last_symptom", label: "Last symptom" },
    { value: "up_to_now", label: "Up to now" },
  ];

  if (loading) {
    return (
      <Card data-testid="card-zebby-findings-loading">
        <CardContent className="pt-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="ml-2">Loading Zebby's findings…</span>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card data-testid="card-zebby-findings-empty">
        <CardContent className="pt-6">
          <p className="text-muted-foreground">No insights available yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-zebby-findings">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-2xl">🦓 Zebby Findings</CardTitle>
            <CardDescription>AI-powered insights from your data</CardDescription>
          </div>
        </div>
        
        {/* Wave 3 - Multi-Entry: Flexible lookback window chips */}
        <div className="flex flex-wrap gap-2 mt-4">
          {windows.map((window) => (
            <Badge
              key={window.value}
              variant={selectedRange === window.value ? "default" : "outline"}
              className="cursor-pointer hover:bg-primary/90 transition-colors"
              onClick={() => setSelectedRange(window.value)}
              data-testid={`chip-range-${window.value}`}
            >
              {window.label}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-base opacity-90" data-testid="text-analysis">
          {data.analysis}
        </p>

        {data.trendBullets && data.trendBullets.length > 0 && (
          <div data-testid="section-trends">
            <h4 className="font-semibold mb-2">Patterns Noticed:</h4>
            <ul className="list-disc pl-5 space-y-1">
              {data.trendBullets.map((bullet, i) => (
                <li key={i} data-testid={`trend-bullet-${i}`}>
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.actionIdeas && data.actionIdeas.length > 0 && (
          <div data-testid="section-action-ideas">
            <h4 className="font-semibold mb-2">Tiny Optional Steps:</h4>
            <ul className="list-disc pl-5 space-y-1">
              {data.actionIdeas.map((idea, i) => (
                <li key={i} data-testid={`action-idea-${i}`}>
                  {idea}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-4" data-testid="text-disclaimer">
          {data.disclaimer}
        </p>
      </CardContent>
    </Card>
  );
}
