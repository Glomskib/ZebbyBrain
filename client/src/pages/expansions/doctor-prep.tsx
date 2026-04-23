import { useMemo, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PlusOnly } from "@/components/shell/Gate";
import { useQuery } from "@tanstack/react-query";
import { Stethoscope, FileText, Download } from "lucide-react";

type Entry = {
  id: string;
  symptomName: string;
  intensity: number;
  loggedAt?: string;
  occurredAt?: string;
  createdAt?: string;
  notes?: string | null;
};

export default function DoctorPrep() {
  const [range, setRange] = useState<"30d" | "90d">("30d");
  const [concerns, setConcerns] = useState("");
  const [questions, setQuestions] = useState("");

  const { data } = useQuery<{ entries: Entry[] } | Entry[]>({
    queryKey: ["/api/symptoms/grouped", range, "doctor"],
    queryFn: async () => {
      const r = await fetch(`/api/symptoms/grouped?window=${range}`, { credentials: "include" });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
  });

  const entries: Entry[] = useMemo(() => {
    if (!data) return [];
    const flat: Entry[] = [];
    if (Array.isArray(data)) {
      for (const item of data as any[]) {
        if (item?.entries && Array.isArray(item.entries)) flat.push(...item.entries);
        else if (item?.symptomName) flat.push(item as Entry);
      }
    } else if ((data as any)?.entries) {
      flat.push(...(data as any).entries);
    }
    return flat;
  }, [data]);

  const summary = useMemo(() => buildSummary(entries, range), [entries, range]);

  function download() {
    const body = [
      `Zebby's World — Appointment summary (${range === "30d" ? "last 30 days" : "last 90 days"})`,
      "",
      summary,
      "",
      "Concerns to raise:",
      concerns.trim() || "—",
      "",
      "Questions I want to ask:",
      questions.trim() || "—",
    ].join("\n");
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zebby-doctor-prep-${range}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell title="Doctor Prep" subtitle="Organize your symptoms before the appointment">
      <div className="space-y-6">
        <Card className="rounded-2xl bg-gradient-to-br from-sky-50 to-violet-50 dark:from-sky-950/20 dark:to-violet-950/20">
          <CardContent className="p-6 flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-sky-200/60 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200 flex items-center justify-center">
              <Stethoscope className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">A brief your provider will actually read.</h2>
              <p className="text-muted-foreground mt-1">
                Turn your last few weeks of symptoms into a clean one-pager — with top symptoms,
                severity trend, and your concerns.
              </p>
            </div>
          </CardContent>
        </Card>

        <PlusOnly
          featureName="Doctor Prep"
          description="Generate a structured pre-appointment brief with a single click. Zebby+ keeps the generator running."
        >
          <Tabs value={range} onValueChange={(v) => setRange(v as any)}>
            <TabsList className="rounded-full">
              <TabsTrigger value="30d" className="rounded-full">Last 30 days</TabsTrigger>
              <TabsTrigger value="90d" className="rounded-full">Last 90 days</TabsTrigger>
            </TabsList>
            <TabsContent value={range} className="mt-4">
              <Card className="rounded-2xl">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="font-medium">Your summary</span>
                  </div>
                  <pre className="text-xs bg-muted/50 rounded-lg p-4 whitespace-pre-wrap leading-relaxed">
                    {summary}
                  </pre>

                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium">Concerns to raise</label>
                      <Textarea
                        className="mt-1 rounded-xl"
                        rows={4}
                        placeholder="e.g. new migraines 3x/week, joint instability in right knee"
                        value={concerns}
                        onChange={(e) => setConcerns(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Questions for the doctor</label>
                      <Textarea
                        className="mt-1 rounded-xl"
                        rows={4}
                        placeholder="e.g. should I try compression sleeves? Should I see a cardiologist?"
                        value={questions}
                        onChange={(e) => setQuestions(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={download} className="rounded-full">
                      <Download className="w-4 h-4 mr-1" /> Download brief
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </PlusOnly>
      </div>
    </AppShell>
  );
}

function buildSummary(entries: Entry[], range: string) {
  if (entries.length === 0) {
    return `No entries logged in the ${range === "30d" ? "last 30 days" : "last 90 days"} yet.\n\nLog a few symptoms in the tracker and your brief will fill in here.`;
  }
  const byName = new Map<string, number[]>();
  for (const e of entries) {
    if (!byName.has(e.symptomName)) byName.set(e.symptomName, []);
    byName.get(e.symptomName)!.push(e.intensity);
  }
  const top = Array.from(byName.entries())
    .map(([n, xs]) => ({
      name: n,
      count: xs.length,
      avg: +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1),
      max: Math.max(...xs),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const totalAvg = +(entries.reduce((a, b) => a + b.intensity, 0) / entries.length).toFixed(1);

  const lines = [
    `Entries: ${entries.length} over the selected window.`,
    `Overall average intensity: ${totalAvg}/10.`,
    "",
    "Top symptoms:",
    ...top.map((t) => `  • ${t.name} — ${t.count}x, avg ${t.avg}/10 (peak ${t.max}/10)`),
  ];
  return lines.join("\n");
}
