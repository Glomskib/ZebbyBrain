import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Star, Target, CheckCircle } from "lucide-react";
import ShareButton from "@/components/ShareButton";

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: "trophy" | "star" | "target" | "check";
  category: "tracking" | "milestones" | "engagement" | "health";
  unlocked: boolean;
  unlockedAt?: string;
  progress?: {
    current: number;
    target: number;
  };
}

export default function AchievementsSection() {
  // For now, we'll generate mock achievements based on user data
  // In a real implementation, this would fetch from the backend
  const { data: symptomLogs } = useQuery({
    queryKey: ["/api/symptoms"],
    retry: false,
  });

  const { data: aiInteractions } = useQuery({
    queryKey: ["/api/ai-interactions"],
    retry: false,
  });

  // Generate achievements based on user activity
  const achievements: Achievement[] = [
    {
      id: "first_symptom_log",
      title: "First Steps",
      description: "Logged your first symptom entry",
      icon: "check",
      category: "tracking",
      unlocked: Array.isArray(symptomLogs) && symptomLogs.length > 0,
      unlockedAt: Array.isArray(symptomLogs) && symptomLogs.length > 0 ? symptomLogs[0]?.createdAt : undefined,
    },
    {
      id: "week_tracker",
      title: "Week Strong",
      description: "Tracked symptoms for 7 days",
      icon: "target",
      category: "tracking",
      unlocked: Array.isArray(symptomLogs) && symptomLogs.length >= 7,
      progress: {
        current: Array.isArray(symptomLogs) ? Math.min(symptomLogs.length, 7) : 0,
        target: 7
      }
    },
    {
      id: "zebby_friend",
      title: "Zebby's Friend",
      description: "Received your first AI reflection",
      icon: "star",
      category: "engagement",
      unlocked: Array.isArray(aiInteractions) && aiInteractions.length > 0,
      unlockedAt: Array.isArray(aiInteractions) && aiInteractions.length > 0 ? aiInteractions[0]?.createdAt : undefined,
    },
    {
      id: "consistent_tracker",
      title: "Consistency Champion",
      description: "Tracked symptoms for 30 days",
      icon: "trophy",
      category: "milestones",
      unlocked: Array.isArray(symptomLogs) && symptomLogs.length >= 30,
      progress: {
        current: Array.isArray(symptomLogs) ? Math.min(symptomLogs.length, 30) : 0,
        target: 30
      }
    }
  ];

  const unlockedAchievements = achievements.filter(a => a.unlocked);
  const inProgressAchievements = achievements.filter(a => !a.unlocked && a.progress);

  const getAchievementIcon = (icon: string) => {
    switch (icon) {
      case 'trophy': return <Trophy className="w-5 h-5" />;
      case 'star': return <Star className="w-5 h-5" />;
      case 'target': return <Target className="w-5 h-5" />;
      case 'check': return <CheckCircle className="w-5 h-5" />;
      default: return <Trophy className="w-5 h-5" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'tracking': return 'bg-blue-500/10 text-blue-600 border-blue-200';
      case 'milestones': return 'bg-purple-500/10 text-purple-600 border-purple-200';
      case 'engagement': return 'bg-green-500/10 text-green-600 border-green-200';
      case 'health': return 'bg-red-500/10 text-red-600 border-red-200';
      default: return 'bg-primary/10 text-primary border-primary/20';
    }
  };

  if (unlockedAchievements.length === 0 && inProgressAchievements.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-4xl mb-4">🏆</div>
          <h3 className="font-semibold text-foreground mb-2">Start Your Journey</h3>
          <p className="text-sm text-muted-foreground">
            Begin tracking your symptoms to unlock achievements and celebrate your progress!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="achievements-section">
      {/* Unlocked Achievements */}
      {unlockedAchievements.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                Your Achievements
              </CardTitle>
              {unlockedAchievements.length > 0 && (
                <ShareButton
                  contentType="achievement"
                  contentData={{
                    achievements: unlockedAchievements,
                    totalUnlocked: unlockedAchievements.length,
                    categories: Array.from(new Set(unlockedAchievements.map(a => a.category)))
                  }}
                  contentSnapshot={{
                    title: "My EDS Health Journey Achievements",
                    totalUnlocked: unlockedAchievements.length,
                    recentAchievements: unlockedAchievements.slice(0, 3).map(a => ({
                      title: a.title,
                      description: a.description,
                      category: a.category,
                      unlockedAt: a.unlockedAt
                    }))
                  }}
                  size="sm"
                  variant="outline"
                  data-testid="button-share-achievements"
                >
                  Share Progress
                </ShareButton>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {unlockedAchievements.map((achievement) => (
              <div
                key={achievement.id}
                className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border"
                data-testid={`achievement-unlocked-${achievement.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${getCategoryColor(achievement.category)}`}>
                    {getAchievementIcon(achievement.icon)}
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground">{achievement.title}</h4>
                    <p className="text-sm text-muted-foreground">{achievement.description}</p>
                    {achievement.unlockedAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ShareButton
                    contentType="achievement"
                    contentData={{
                      achievement: achievement,
                      unlockedAt: achievement.unlockedAt
                    }}
                    contentSnapshot={{
                      title: achievement.title,
                      description: achievement.description,
                      category: achievement.category,
                      unlockedAt: achievement.unlockedAt
                    }}
                    size="sm"
                    variant="ghost"
                    data-testid={`button-share-achievement-${achievement.id}`}
                  />
                  <Badge variant="secondary" className="text-xs">
                    {achievement.category}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* In Progress Achievements */}
      {inProgressAchievements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              In Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {inProgressAchievements.map((achievement) => (
              <div
                key={achievement.id}
                className="flex items-center justify-between p-4 bg-muted/20 rounded-lg border border-dashed"
                data-testid={`achievement-progress-${achievement.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center bg-muted border-2 border-dashed`}>
                    {getAchievementIcon(achievement.icon)}
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground">{achievement.title}</h4>
                    <p className="text-sm text-muted-foreground">{achievement.description}</p>
                    {achievement.progress && (
                      <div className="mt-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{achievement.progress.current}/{achievement.progress.target}</span>
                          <div className="w-16 bg-muted rounded-full h-1.5">
                            <div 
                              className="bg-primary h-1.5 rounded-full transition-all duration-300"
                              style={{ width: `${(achievement.progress.current / achievement.progress.target) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  {achievement.category}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}