import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Minus, Heart, Moon, Activity, AlertTriangle, Target, BarChart3 } from "lucide-react";
import { useState } from "react";

type RangeKey = "7d" | "30d" | "90d";

interface InsightCard {
  id: string;
  title: string;
  kind: "trend" | "count" | "vitals" | "correlation";
  period: RangeKey;
  metric: any;
  summary: string;
  nudge: string;
  disclaimer: string;
}

interface InsightCardsData {
  period: RangeKey;
  cards: InsightCard[];
}

export default function InsightCards() {
  const [selectedRange, setSelectedRange] = useState<RangeKey>("30d");
  
  const { data: insightData, isLoading, error } = useQuery<InsightCardsData>({
    queryKey: ['/api/insights/snapshot', selectedRange],
    queryFn: async () => {
      const response = await fetch(`/api/insights/snapshot?range=${selectedRange}`);
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required');
        }
        throw new Error('Failed to fetch insights');
      }
      return response.json();
    },
    retry: false,
  });

  const ranges: { key: RangeKey; label: string }[] = [
    { key: "7d", label: "7 days" },
    { key: "30d", label: "30 days" },
    { key: "90d", label: "90 days" },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">EDS Health Insights</h2>
          <div className="flex gap-2">
            {ranges.map(range => (
              <div key={range.key} className="w-16 h-8 bg-muted rounded animate-pulse" />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="insight-card">
              <CardContent className="p-6">
                <div className="space-y-3">
                  <div className="h-4 bg-muted rounded animate-pulse" />
                  <div className="h-8 bg-muted rounded animate-pulse" />
                  <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
                  <div className="h-2 bg-muted rounded animate-pulse w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="insight-card border-destructive/20">
        <CardContent className="p-6 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h3 className="font-semibold text-destructive mb-2">Unable to Load Insights</h3>
          <p className="text-sm text-muted-foreground">
            {error.message === 'Authentication required' 
              ? 'Please log in to view your health insights.' 
              : 'Start tracking symptoms and health data to see personalized insights.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const { cards = [] } = insightData || {};

  if (cards.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">EDS Health Insights</h2>
          <div className="flex gap-2">
            {ranges.map(range => (
              <Button
                key={range.key}
                variant={selectedRange === range.key ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedRange(range.key)}
                className="text-xs"
                data-testid={`button-timeframe-${range.key}`}
              >
                {range.label}
              </Button>
            ))}
          </div>
        </div>
        <Card className="insight-card">
          <CardContent className="p-8 text-center">
            <div className="text-6xl mb-4">🦓</div>
            <h3 className="font-semibold text-foreground mb-2">No Insights Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Keep tracking your EDS symptoms, vitals, and sleep to unlock personalized insights tailored for your condition.
            </p>
            <Button className="bg-primary hover:bg-primary/90" data-testid="button-start-tracking">
              Start Tracking
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="insight-cards-section">
      {/* Header with range selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">EDS Health Insights</h2>
          <p className="text-sm text-muted-foreground">
            Gentle analytics to help understand your EDS patterns — not medical advice
          </p>
        </div>
        <div className="flex gap-2">
          {ranges.map(range => (
            <Button
              key={range.key}
              variant={selectedRange === range.key ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedRange(range.key)}
              className="text-xs"
              data-testid={`button-timeframe-${range.key}`}
            >
              {range.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Insight Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map((card, index) => (
          <InsightCardComponent key={card.id} card={card} index={index} />
        ))}
      </div>
    </div>
  );
}

function InsightCardComponent({ card, index }: { card: InsightCard; index: number }) {
  const [showDetails, setShowDetails] = useState(false);

  const getKindIcon = (kind: string) => {
    switch (kind) {
      case 'trend': return <TrendingUp className="w-4 h-4" />;
      case 'count': return <AlertTriangle className="w-4 h-4" />;
      case 'vitals': return <Heart className="w-4 h-4" />;
      case 'correlation': return <BarChart3 className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  const getKindColor = (kind: string) => {
    switch (kind) {
      case 'trend': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
      case 'count': return 'bg-orange-500/10 text-orange-600 dark:text-orange-400';
      case 'vitals': return 'bg-red-500/10 text-red-600 dark:text-red-400';
      case 'correlation': return 'bg-purple-500/10 text-purple-600 dark:text-purple-400';
      default: return 'bg-primary/10 text-primary';
    }
  };

  const formatMetric = (card: InsightCard) => {
    switch (card.kind) {
      case 'trend':
        const delta = card.metric?.delta || 0;
        const avg = card.metric?.avg || 0;
        return (
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{avg}/10</span>
            {delta !== 0 && (
              <div className={`flex items-center gap-1 text-sm ${
                delta > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
              }`}>
                {delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                <span>{delta > 0 ? '+' : ''}{delta}</span>
              </div>
            )}
          </div>
        );
      case 'count':
        return (
          <div className="text-2xl font-bold">
            {card.metric?.value || 0} {card.metric?.unit || ''}
          </div>
        );
      case 'vitals':
        return (
          <div className="text-2xl font-bold">
            {card.metric?.value || 0} {card.metric?.unit || ''}
          </div>
        );
      case 'correlation':
        const strength = card.metric?.strength || 'none';
        const r = card.metric?.r || 0;
        return (
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">r={r}</span>
            <Badge 
              variant={strength === 'strong' ? 'default' : strength === 'moderate' ? 'secondary' : 'outline'}
              className="text-xs"
            >
              {strength}
            </Badge>
          </div>
        );
      default:
        return <span className="text-2xl font-bold">—</span>;
    }
  };

  return (
    <Card 
      className="insight-card transition-all duration-200 hover:scale-[1.01] cursor-pointer border-l-4 border-l-primary/20"
      onClick={() => setShowDetails(!showDetails)}
      data-testid={`insight-card-${card.id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getKindColor(card.kind)}`}>
            {getKindIcon(card.kind)}
          </div>
          <Badge variant="outline" className="text-xs">
            {card.period}
          </Badge>
        </div>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {card.title}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-3">
          <div className="flex items-center" data-testid={`metric-${card.id}`}>
            {formatMetric(card)}
          </div>
          
          <p className="text-sm text-foreground">
            {card.summary}
          </p>

          {showDetails && (
            <div className="mt-4 space-y-3">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <h4 className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  Gentle Nudge
                </h4>
                <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                  {card.nudge}
                </p>
              </div>
              <p className="text-xs text-muted-foreground italic">
                {card.disclaimer}
              </p>
            </div>
          )}

          {!showDetails && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full text-xs text-muted-foreground hover:text-foreground h-8"
              data-testid={`button-${card.id}-details`}
            >
              Tap for guidance
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}