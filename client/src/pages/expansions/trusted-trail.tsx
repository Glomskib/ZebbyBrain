import { AppShell } from "@/components/shell/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Route as RouteIcon, CheckCircle2, Circle, Lock } from "lucide-react";

type Step = {
  id: string;
  title: string;
  kind: "tracker" | "resource" | "community" | "prep" | "rest";
  status: "done" | "open" | "future";
  body: string;
};

const TRAIL: Step[] = [
  {
    id: "tutorial",
    title: "Log your first symptom",
    kind: "tracker",
    status: "open",
    body: "Open the tracker and log whatever's loudest right now. It doesn't need to be tidy.",
  },
  {
    id: "hydration",
    title: "Set a hydration cadence",
    kind: "rest",
    status: "open",
    body: "Pick a water goal for the day. POTS bodies like frequent + salted.",
  },
  {
    id: "pasture",
    title: "Find your first Pasture",
    kind: "community",
    status: "open",
    body: "Browse community groups and follow one that matches your type/age/diagnosis.",
  },
  {
    id: "ask",
    title: "Ask Zebby a real question",
    kind: "resource",
    status: "open",
    body: "Try 'what are common EDS triggers for joint pain?' — get a supportive, sourced answer.",
  },
  {
    id: "doctor",
    title: "Prep your next appointment",
    kind: "prep",
    status: "future",
    body: "Doctor Prep summarizes your last 30 days into a shareable brief.",
  },
  {
    id: "pacing",
    title: "Try a pacing plan",
    kind: "rest",
    status: "future",
    body: "Calm Corner has guided pacing journeys for low-spoon days.",
  },
];

export default function TrustedTrail() {
  return (
    <AppShell title="Trusted Trail" subtitle="A gentle path through the app — go at your own pace">
      <div className="space-y-6">
        <Card className="rounded-2xl bg-gradient-to-br from-emerald-50 to-sky-50 dark:from-emerald-950/20 dark:to-sky-950/20">
          <CardContent className="p-6 flex gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-200/60 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200 flex items-center justify-center">
              <RouteIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">One step at a time.</h2>
              <p className="text-muted-foreground mt-1">
                The Trusted Trail is a guided tour of what Zebby's World can offer. Skip anything
                that doesn't fit today — it'll be here tomorrow.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {TRAIL.map((step, idx) => (
            <Card key={step.id} className="rounded-2xl">
              <CardContent className="p-5 flex items-start gap-4">
                <div className="flex flex-col items-center pt-1">
                  {step.status === "done" ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  ) : step.status === "open" ? (
                    <Circle className="w-6 h-6 text-primary" />
                  ) : (
                    <Lock className="w-6 h-6 text-muted-foreground" />
                  )}
                  {idx < TRAIL.length - 1 && <div className="w-px flex-1 bg-border mt-2" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{step.title}</span>
                    <Badge variant="outline" className="capitalize">{step.kind}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{step.body}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
