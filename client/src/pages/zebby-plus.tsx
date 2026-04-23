import { AppShell } from "@/components/shell/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Gem, Sparkles, HeartHandshake, Moon, Stethoscope, BarChart3 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const PERKS = [
  { icon: <BarChart3 className="w-5 h-5" />, title: "Herd Insights", body: "See how your patterns compare to other zebras — gently, anonymously." },
  { icon: <Moon className="w-5 h-5" />, title: "Zzzebby Sounds", body: "Soothing soundscapes for flares, migraines, and sleep." },
  { icon: <HeartHandshake className="w-5 h-5" />, title: "Calm Corner unlocks", body: "Guided grounding and pacing journeys built for EDS/POTS." },
  { icon: <Stethoscope className="w-5 h-5" />, title: "Doctor Prep", body: "Generate organized symptom summaries for appointments." },
  { icon: <Sparkles className="w-5 h-5" />, title: "Priority Ask-Zebby", body: "Higher daily AI query limits and deeper history windows." },
];

export default function ZebbyPlus() {
  const { user } = useAuth() as { user?: { plan?: string; planStatus?: string } };
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const isPlus = user?.plan === "plus" && (user?.planStatus === "active" || user?.planStatus === "trialing");

  async function startCheckout() {
    setBusy(true);
    try {
      const r = await apiRequest("POST", "/api/billing/create-subscription", {});
      const data = await r.json();
      if (data?.url) {
        window.location.href = data.url;
      } else if (data?.clientSecret) {
        toast({ title: "Payment ready", description: "Complete checkout in the opened window." });
      } else {
        toast({
          title: "Zebby+ not configured yet",
          description: "Stripe keys are not set in this environment. Once configured, checkout will open here.",
        });
      }
    } catch (err: any) {
      toast({
        title: "Zebby+ not configured yet",
        description: "When Stripe is connected, this button opens checkout.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Zebby+" subtitle="Extra care for the zebra herd">
      <div className="space-y-6">
        <Card className="rounded-2xl overflow-hidden bg-gradient-to-br from-amber-50 to-rose-50 dark:from-amber-950/30 dark:to-rose-950/30 border-amber-200 dark:border-amber-900/40">
          <CardContent className="p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-amber-200/70 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
              <Gem className="w-8 h-8 text-amber-700 dark:text-amber-200" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl md:text-3xl font-bold">Zebby+</h2>
              <p className="text-muted-foreground max-w-xl mt-1">
                Your support helps keep Zebby's World running — and unlocks deeper care tools built
                with and for the chronic illness community.
              </p>
            </div>
            {isPlus ? (
              <div className="rounded-full px-4 py-2 bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200 font-medium">
                You're a Zebby+ member 🦓
              </div>
            ) : (
              <Button size="lg" className="rounded-full" disabled={busy} onClick={startCheckout}>
                {busy ? "Opening..." : "Upgrade to Zebby+"}
              </Button>
            )}
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-4">
          {PERKS.map((p) => (
            <Card key={p.title} className="rounded-2xl">
              <CardContent className="p-5 flex gap-4 items-start">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  {p.icon}
                </div>
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    {p.title}
                    <Check className="w-4 h-4 text-emerald-500" />
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{p.body}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="rounded-2xl">
          <CardContent className="p-5 text-sm text-muted-foreground">
            Zebby+ is about sustainability, not paywalls. Core symptom tracking, journaling,
            community pastures, and your data export are — and will stay — free.
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
