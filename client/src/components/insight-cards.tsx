import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Minus, Clock, Heart, Moon, Activity } from "lucide-react";
import { useState } from "react";

interface InsightCard {
  id: string;
  title: string;
  value: string;
  trend: 'up' | 'down' | 'stable';
  trendValue: string;
  description: string;
  actionableInsight: string;
  category: 'symptoms' | 'vitals' | 'sleep' | 'general';
  severity: 'low' | 'medium' | 'high';
}

interface InsightCardsData {
  cards: InsightCard[];
  timeframe: string;
  availableTimeframes: { days: number; label: string }[];
}

export default function InsightCards() {
  const [selectedTimeframe, setSelectedTimeframe] = useState(30);
  
  const { data: insightData, isLoading, error } = useQuery<InsightCardsData>({
    queryKey: ['/api/analytics/insights', selectedTimeframe],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/insights?timeframe=${selectedTimeframe}`);
      if (!response.ok) {
        throw new Error('Failed to fetch insights');
      }
      return response.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">Health Insights</h2>
          <div className="flex gap-2">
            {[7, 30, 90].map(days => (
              <div key={days} className="w-12 h-8 bg-muted rounded animate-pulse" />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="insight-card">
              <CardContent className="p-6">
                <div className="space-y-3">
                  <div className="h-4 bg-muted rounded animate-pulse" />
                  <div className="h-8 bg-muted rounded animate-pulse" />
                  <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
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
            Start tracking symptoms and health data to see personalized insights.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { cards = [], availableTimeframes = [] } = insightData || {};

  if (cards.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">Health Insights</h2>
        </div>
        <Card className="insight-card">
          <CardContent className="p-8 text-center">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="font-semibold text-foreground mb-2">No Insights Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Keep tracking your symptoms and health data to unlock personalized insights and trends.
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
      {/* Header with timeframe selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Health Insights</h2>
          <p className="text-sm text-muted-foreground">
            Gentle analytics to help you understand your patterns
          </p>
        </div>
        <div className="flex gap-2">
          {availableTimeframes.map(timeframe => (
            <Button
              key={timeframe.days}
              variant={selectedTimeframe === timeframe.days ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedTimeframe(timeframe.days)}
              className="text-xs"
              data-testid={`button-timeframe-${timeframe.days}`}
            >
              {timeframe.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Insight Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cards.map((card, index) => (
          <InsightCardComponent key={card.id} card={card} index={index} />
        ))}
      </div>
    </div>
  );
}

function InsightCardComponent({ card, index }: { card: InsightCard; index: number }) {
  const [showDetails, setShowDetails] = useState(false);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'symptoms': return <Activity className="w-4 h-4" />;
      case 'vitals': return <Heart className="w-4 h-4" />;
      case 'sleep': return <Moon className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'symptoms': return 'bg-primary/10 text-primary';
      case 'vitals': return 'bg-red-500/10 text-red-600 dark:text-red-400';
      case 'sleep': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
      default: return 'bg-accent/10 text-accent-foreground';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />;
      case 'down': return <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />;
      default: return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20';
      case 'medium': return 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/20';
      default: return 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20';
    }
  };

  return (
    <Card 
      className={`insight-card transition-all duration-200 hover:scale-[1.02] cursor-pointer ${getSeverityColor(card.severity)}`}
      onClick={() => setShowDetails(!showDetails)}
      data-testid={`insight-card-${card.id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getCategoryColor(card.category)}`}>
            {getCategoryIcon(card.category)}
          </div>
          <div className="flex items-center gap-1">
            {getTrendIcon(card.trend)}
            <span className={`text-xs font-medium ${
              card.trend === 'up' ? 'text-green-600 dark:text-green-400' :
              card.trend === 'down' ? 'text-red-600 dark:text-red-400' :
              'text-muted-foreground'
            }`}>
              {card.trendValue}
            </span>
          </div>
        </div>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {card.title}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-3">
          <div className="text-2xl font-bold text-foreground" data-testid={`text-${card.id}-value`}>
            {card.value}
          </div>
          
          <p className="text-xs text-muted-foreground">
            {card.description}
          </p>

          {showDetails && (
            <div className="mt-4 p-3 bg-accent/20 rounded-lg border border-accent/30 floating-animation">
              <h4 className="text-xs font-semibold text-accent-foreground mb-2">💡 Gentle Insight</h4>
              <p className="text-xs text-accent-foreground/80 leading-relaxed">
                {card.actionableInsight}
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
              Tap for insight
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}