import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ZebbyFindingsData {
  range: string;
  analysis: string;
  trendBullets: string[];
  actionIdeas: string[];
  disclaimer: string;
}

export default function ZebbyFindings({ range = "30d" }: { range?: "30d" | "90d" }) {
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
          body: JSON.stringify({ range }),
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
  }, [range, toast]);

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
        <CardTitle className="text-2xl">🦓 Zebby Findings</CardTitle>
        <CardDescription>AI-powered insights from your {range} data</CardDescription>
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
