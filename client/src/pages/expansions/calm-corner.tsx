import { useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusOnly } from "@/components/shell/Gate";
import { HeartHandshake, Wind, Waves, Sparkles } from "lucide-react";

const FREE_EXERCISES = [
  {
    id: "box",
    title: "Box breathing · 4-4-4-4",
    body: "Inhale 4, hold 4, exhale 4, hold 4. Helpful for POTS dysregulation.",
    icon: <Wind className="w-5 h-5" />,
    durationS: 60,
  },
  {
    id: "ground",
    title: "5-4-3-2-1 grounding",
    body: "Name 5 things you see, 4 you feel, 3 you hear, 2 you smell, 1 you taste.",
    icon: <Sparkles className="w-5 h-5" />,
    durationS: 120,
  },
];

const PREMIUM_JOURNEYS = [
  { id: "flare", title: "Flare-down reset", minutes: 10 },
  { id: "pacing", title: "Pacing plan for the day", minutes: 6 },
  { id: "sleep", title: "Wind-down for racing HR", minutes: 15 },
  { id: "migraine", title: "Migraine companion", minutes: 12 },
];

export default function CalmCorner() {
  const [active, setActive] = useState<string | null>(null);

  return (
    <AppShell title="Calm Corner" subtitle="Gentle exercises for flares and overwhelm">
      <div className="space-y-6">
        <Card className="rounded-2xl overflow-hidden bg-gradient-to-br from-rose-50 to-teal-50 dark:from-rose-950/20 dark:to-teal-950/20">
          <CardContent className="p-6 flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-200/60 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200 flex items-center justify-center">
              <HeartHandshake className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">You don't have to push through.</h2>
              <p className="text-muted-foreground mt-1">
                A few calm minutes here won't fix a flare — but they can take the edge off and
                remind your nervous system that you're safe.
              </p>
            </div>
          </CardContent>
        </Card>

        <section>
          <h3 className="text-sm uppercase tracking-wide text-muted-foreground mb-3">Quick grounding</h3>
          <div className="grid md:grid-cols-2 gap-4">
            {FREE_EXERCISES.map((ex) => (
              <Card key={ex.id} className="rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      {ex.icon}
                    </span>
                    {ex.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{ex.body}</p>
                  <Button
                    variant={active === ex.id ? "secondary" : "default"}
                    className="rounded-full"
                    onClick={() => setActive((c) => (c === ex.id ? null : ex.id))}
                    data-testid={`button-calm-start-${ex.id}`}
                  >
                    {active === ex.id ? "Pause" : `Start (${ex.durationS}s)`}
                  </Button>
                  {active === ex.id && (
                    <div className="pt-2">
                      <BreathingVisualizer />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-sm uppercase tracking-wide text-muted-foreground mb-3">Guided journeys</h3>
          <PlusOnly
            featureName="Guided journeys"
            description="Longer, paced audio journeys for flares, migraines, sleep, and the hard days."
          >
            <div className="grid md:grid-cols-2 gap-4">
              {PREMIUM_JOURNEYS.map((j) => (
                <Card key={j.id} className="rounded-2xl">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2">
                      <Waves className="w-4 h-4 text-primary" />
                      <span className="font-medium">{j.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{j.minutes} min · audio</p>
                    <Button className="mt-3 rounded-full" size="sm">Begin journey</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </PlusOnly>
        </section>
      </div>
    </AppShell>
  );
}

function BreathingVisualizer() {
  return (
    <div className="flex items-center justify-center py-4">
      <div className="w-24 h-24 rounded-full bg-primary/20 animate-pulse border-4 border-primary/40" />
    </div>
  );
}
