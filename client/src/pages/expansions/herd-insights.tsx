import { AppShell } from "@/components/shell/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { PlusOnly } from "@/components/shell/Gate";
import { BarChart3, Users, TrendingUp, Info } from "lucide-react";

// Placeholder comparative cohort snippets — real numbers will be wired when we
// have enough data volume to anonymize and aggregate safely.
const CARDS = [
  {
    icon: <Users className="w-5 h-5" />,
    title: "Herd size",
    value: "Coming in Wave 4",
    body: "Anonymized cohort size by EDS type, age, and region. Only shown when groups are large enough to stay anonymous.",
  },
  {
    icon: <TrendingUp className="w-5 h-5" />,
    title: "Your pattern vs. herd",
    value: "Coming soon",
    body: "See whether a specific symptom is more prominent for you than for similar zebras. Never identifying.",
  },
  {
    icon: <BarChart3 className="w-5 h-5" />,
    title: "Seasonal trends",
    value: "Coming soon",
    body: "How the herd moves with weather, daylight, and seasons — purely aggregate, privacy-first.",
  },
];

export default function HerdInsights() {
  return (
    <AppShell title="Herd Insights" subtitle="See yourself in community patterns">
      <div className="space-y-6">
        <PlusOnly
          featureName="Herd Insights"
          description="Compare your patterns to the wider community — anonymized, aggregated, and never identifying."
        >
          <div className="grid md:grid-cols-2 gap-4">
            {CARDS.map((c) => (
              <Card key={c.title} className="rounded-2xl">
                <CardContent className="p-5 flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    {c.icon}
                  </div>
                  <div>
                    <div className="font-semibold">{c.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{c.value}</div>
                    <p className="text-sm text-muted-foreground mt-2">{c.body}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </PlusOnly>
        <Card className="rounded-2xl">
          <CardContent className="p-5 flex items-start gap-3 text-sm text-muted-foreground">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Herd Insights never shows individual users, and never compares cohorts smaller than
              the privacy threshold. Your raw data stays yours.
            </span>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
