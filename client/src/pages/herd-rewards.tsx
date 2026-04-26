import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Gift, TrendingUp, Users, Sticker, Tag, Droplets, BadgePercent, Shirt, Lock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Navigation from "@/components/navigation";

interface RewardEntry {
  id: string;
  userId: string;
  points: number;
  reason: string;
  referenceId: string | null;
  createdAt: string;
}

export default function HerdRewards() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // Fetch referral code
  const { data: codeData } = useQuery<{ code: string }>({
    queryKey: ["/api/referrals/code"],
  });

  // Fetch points balance
  const { data: balanceData } = useQuery<{ points: number }>({
    queryKey: ["/api/rewards/balance"],
  });

  // Fetch rewards history
  const { data: history = [] } = useQuery<RewardEntry[]>({
    queryKey: ["/api/rewards/history"],
  });

  const handleCopyCode = () => {
    if (codeData?.code) {
      const baseUrl = window.location.origin;
      const referralUrl = `${baseUrl}/?ref=${codeData.code}`;
      navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      toast({
        title: "Copied to clipboard!",
        description: "Share this link with friends to earn rewards",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getReasonLabel = (reason: string) => {
    const labels: Record<string, string> = {
      'invite_confirmed': 'Friend Joined',
      'week_active': 'Weekly Active Bonus',
      'manual_adjustment': 'Manual Adjustment',
    };
    return labels[reason] || reason;
  };

  const getReasonIcon = (reason: string) => {
    if (reason === 'invite_confirmed') return <Users className="w-4 h-4" />;
    if (reason === 'week_active') return <TrendingUp className="w-4 h-4" />;
    return <Gift className="w-4 h-4" />;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Herd Rewards</h1>
          <p className="text-muted-foreground">
            Grow the zebra herd and earn rewards! Invite friends and stay active to unlock points.
          </p>
        </div>

        {/* Reward Ladder */}
        <RewardLadder points={balanceData?.points || 0} />

        {/* Points Balance Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-primary" />
              Your Points
            </CardTitle>
            <CardDescription>Your current rewards balance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary" data-testid="rewards-balance">
              {balanceData?.points || 0}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Points can be redeemed for premium features (coming soon!)
            </p>
          </CardContent>
        </Card>

        {/* Referral Code Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Your Referral Link
            </CardTitle>
            <CardDescription>
              Share this link with friends. When they sign up, you'll earn 100 points!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                readOnly
                value={codeData?.code ? `${window.location.origin}/?ref=${codeData.code}` : "Loading..."}
                className="font-mono text-sm"
                data-testid="input-referral-link"
              />
              <Button
                onClick={handleCopyCode}
                variant={copied ? "default" : "outline"}
                size="icon"
                disabled={!codeData?.code}
                data-testid="button-copy-referral"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            
            {codeData?.code && (
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm font-medium mb-2">Your Code: <span data-testid="referral-code" className="font-mono">{codeData.code}</span></p>
                <p className="text-sm font-medium mb-2">How it works:</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Share your link with friends who have EDS or rare conditions</li>
                  <li>• When they sign up using your link, you earn <strong>+100 points</strong></li>
                  <li>• If they stay active for a week, you earn <strong>+250 more points</strong></li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transaction History Card */}
        <Card>
          <CardHeader>
            <CardTitle>Rewards History</CardTitle>
            <CardDescription>
              Your recent point transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Gift className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No rewards yet. Start by inviting friends!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((entry, index) => (
                  <div key={entry.id}>
                    <div 
                      className="flex items-center justify-between py-3"
                      data-testid={`reward-entry-${index}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-primary/10 text-primary">
                          {getReasonIcon(entry.reason)}
                        </div>
                        <div>
                          <p className="font-medium" data-testid={`text-reward-reason-${index}`}>
                            {getReasonLabel(entry.reason)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      <Badge 
                        variant={entry.points > 0 ? "default" : "secondary"}
                        className="font-mono"
                        data-testid={`badge-reward-points-${index}`}
                      >
                        {entry.points > 0 ? '+' : ''}{entry.points}
                      </Badge>
                    </div>
                    {index < history.length - 1 && <Separator />}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// RewardLadder: visual 5-tier progression with thresholds. Cosmetic only —
// real fulfillment is manual / placeholder until a shop is connected.
// ----------------------------------------------------------------------------
const TIERS = [
  { id: "sticker", label: "Zebra sticker pack", at: 100, icon: Sticker },
  { id: "discount", label: "10% off Zebby's Pouch", at: 300, icon: Tag },
  { id: "electrolytes", label: "Electrolyte sample", at: 600, icon: Droplets },
  { id: "discount-2", label: "25% off Zebby's Pouch", at: 1000, icon: BadgePercent },
  { id: "hoodie", label: "Zebby herd hoodie", at: 2000, icon: Shirt },
] as const;

function RewardLadder({ points }: { points: number }) {
  const nextIdx = TIERS.findIndex((t) => points < t.at);
  const next = nextIdx >= 0 ? TIERS[nextIdx] : null;
  const progressPct = next
    ? Math.min(100, Math.round((points / next.at) * 100))
    : 100;
  return (
    <Card className="mb-6 rounded-3xl border-0 shadow-zebby overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-primary" />
          Reward ladder
        </CardTitle>
        <CardDescription>
          {next
            ? `${next.at - points} more points until "${next.label}"`
            : "All tiers unlocked — thank you for being part of the herd."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-secondary"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {TIERS.map((t, i) => {
            const unlocked = points >= t.at;
            const isNext = nextIdx === i;
            const Icon = t.icon;
            return (
              <div
                key={t.id}
                className={`rounded-2xl border p-3 flex flex-col items-center text-center gap-1 transition-all ${
                  unlocked
                    ? "border-primary bg-primary/5"
                    : isNext
                      ? "border-amber-300 bg-amber-50 dark:bg-amber-900/20"
                      : "border-border bg-card"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    unlocked
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {unlocked ? <Icon className="w-5 h-5" /> : <Lock className="w-4 h-4" />}
                </div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t.at} pts
                </div>
                <div className="text-sm font-medium leading-tight">{t.label}</div>
                {isNext && (
                  <div className="text-[10px] text-amber-700 dark:text-amber-300 font-medium">
                    Up next
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Free for everyone. Zebby+ members earn 1.5× points and unlock priority support.
        </p>
      </CardContent>
    </Card>
  );
}
