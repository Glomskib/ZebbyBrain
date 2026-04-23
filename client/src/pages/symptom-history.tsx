import { useMemo, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { Activity, Droplet, Heart, Plus } from "lucide-react";

type RawEntry = {
  id: string;
  symptomName: string;
  intensity: number;
  bodyPart?: string | null;
  notes?: string | null;
  loggedAt?: string;
  occurredAt?: string;
  createdAt?: string;
  tags?: string[] | null;
};

type Entry = RawEntry & { loggedAt: string };

type GroupedByDate = Array<{ date: string; count: number; entries: RawEntry[] }>;

export default function SymptomHistory() {
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");

  const { data, isLoading } = useQuery<GroupedByDate | RawEntry[]>({
    queryKey: ["/api/symptoms/grouped", range],
    queryFn: async () => {
      const r = await fetch(`/api/symptoms/grouped?window=${range}`, { credentials: "include" });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
  });

  const entries: Entry[] = useMemo(() => {
    if (!data) return [];
    const flat: RawEntry[] = [];
    if (Array.isArray(data)) {
      for (const item of data) {
        if ((item as any).entries && Array.isArray((item as any).entries)) {
          flat.push(...(item as any).entries);
        } else if ((item as any).symptomName) {
          flat.push(item as RawEntry);
        }
      }
    }
    return flat.map((e) => ({
      ...e,
      loggedAt: e.loggedAt || e.occurredAt || e.createdAt || new Date().toISOString(),
    }));
  }, [data]);

  const byDay = useMemo(() => groupByDay(entries), [entries]);
  const bySymptom = useMemo(() => topSymptoms(entries), [entries]);

  return (
    <AppShell title="Symptom history" subtitle="Patterns across your herd of days">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={range} onValueChange={(v) => setRange(v as any)}>
            <TabsList className="rounded-full">
              <TabsTrigger value="7d" className="rounded-full">7 days</TabsTrigger>
              <TabsTrigger value="30d" className="rounded-full">30 days</TabsTrigger>
              <TabsTrigger value="90d" className="rounded-full">90 days</TabsTrigger>
            </TabsList>
          </Tabs>
          <Link href="/tracker">
            <Button size="sm" className="rounded-full" data-testid="button-history-add">
              <Plus className="w-4 h-4 mr-1" /> Log new
            </Button>
          </Link>
          <div className="ml-auto text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${entries.length} entries`}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <SummaryTile icon={<Activity className="w-4 h-4" />} label="Entries logged" value={entries.length} />
          <SummaryTile
            icon={<Heart className="w-4 h-4" />}
            label="Avg intensity"
            value={avg(entries.map((e) => e.intensity)).toFixed(1)}
          />
          <SummaryTile
            icon={<Droplet className="w-4 h-4" />}
            label="Top symptom"
            value={bySymptom[0]?.name ?? "—"}
          />
        </div>

        <Tabs defaultValue="timeline" className="w-full">
          <TabsList className="rounded-full">
            <TabsTrigger value="timeline" className="rounded-full">Timeline</TabsTrigger>
            <TabsTrigger value="symptoms" className="rounded-full">By symptom</TabsTrigger>
            <TabsTrigger value="entries" className="rounded-full">Entries</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="mt-4">
            <Card className="rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Daily average intensity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={byDay} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="day" fontSize={12} />
                      <YAxis domain={[0, 10]} fontSize={12} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="avg"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="symptoms" className="mt-4">
            <Card className="rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Most-logged symptoms</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={bySymptom} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" fontSize={12} interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis fontSize={12} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="count" name="Times logged" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                      <Bar dataKey="avgIntensity" name="Avg intensity" fill="hsl(var(--accent))" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="entries" className="mt-4">
            <Card className="rounded-2xl">
              <CardContent className="p-0 divide-y divide-border">
                {entries.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    No entries yet. Log your first symptom from the tracker.
                  </div>
                ) : (
                  entries
                    .slice()
                    .sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime())
                    .slice(0, 100)
                    .map((e) => (
                      <div key={e.id} className="p-4 flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                          {e.intensity}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{e.symptomName}</span>
                            {e.bodyPart && <Badge variant="secondary">{e.bodyPart}</Badge>}
                            {e.tags?.map((t) => (
                              <Badge key={t} variant="outline">{t}</Badge>
                            ))}
                          </div>
                          {e.notes && <p className="text-sm text-muted-foreground mt-1">{e.notes}</p>}
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(e.loggedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function SummaryTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function groupByDay(entries: Entry[]) {
  const map = new Map<string, number[]>();
  for (const e of entries) {
    const d = new Date(e.loggedAt);
    const key = d.toISOString().slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e.intensity);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, vals]) => ({ day: day.slice(5), avg: +avg(vals).toFixed(2) }));
}

function topSymptoms(entries: Entry[]) {
  const map = new Map<string, { count: number; total: number }>();
  for (const e of entries) {
    const bucket = map.get(e.symptomName) || { count: 0, total: 0 };
    bucket.count += 1;
    bucket.total += e.intensity;
    map.set(e.symptomName, bucket);
  }
  return Array.from(map.entries())
    .map(([name, { count, total }]) => ({ name, count, avgIntensity: +(total / count).toFixed(1) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function avg(ns: number[]) {
  if (ns.length === 0) return 0;
  return ns.reduce((a, b) => a + b, 0) / ns.length;
}
