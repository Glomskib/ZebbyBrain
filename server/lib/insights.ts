import { desc, eq, gte, lt, and, sql, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  symptomLogs,
  symptomEntries,
  vitalsLogs,
  sleepLogs,
  insightsCache,
  type InsightsCache
} from "../../shared/schema";

export type RangeKey = "7d" | "30d" | "90d";

const RANGE_DAYS: Record<RangeKey, number> = { "7d": 7, "30d": 30, "90d": 90 };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function shiftDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function pearson(x: number[], y: number[]) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return { r: 0, strength: "none" as const };
  const xs = x.slice(0, n), ys = y.slice(0, n);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const vx = xs[i] - mx, vy = ys[i] - my;
    num += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  const denom = Math.sqrt(dx * dy) || 1;
  const r = num / denom;
  const a = Math.abs(r);
  const strength = a >= 0.6 ? "strong" : a >= 0.35 ? "moderate" : a >= 0.2 ? "weak" : "none";
  return { r, strength };
}

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

/**
 * Returns safe, plain-language summary insights for a user/range.
 * No diagnoses; "may be associated" style.
 */
export async function computeInsights(userId: string, rangeKey: RangeKey) {
  const days = RANGE_DAYS[rangeKey];
  const today = startOfDay(new Date());
  const from = shiftDays(today, -days);
  const prevFrom = shiftDays(from, -days); // previous equal period

  // --- Symptoms: averages & flares ---
  const curSymptomLogs = await db
    .select({
      timestamp: symptomLogs.timestamp,
      id: symptomLogs.id,
    })
    .from(symptomLogs)
    .where(
      and(
        eq(symptomLogs.userId, userId),
        gte(symptomLogs.timestamp, from),
        lt(symptomLogs.timestamp, today)
      )
    );

  const prevSymptomLogs = await db
    .select({
      id: symptomLogs.id,
    })
    .from(symptomLogs)
    .where(
      and(
        eq(symptomLogs.userId, userId),
        gte(symptomLogs.timestamp, prevFrom),
        lt(symptomLogs.timestamp, from)
      )
    );

  // Get symptom entries for current period (only if logs exist)
  const curSymptomEntries = curSymptomLogs.length > 0
    ? await db
        .select({
          symptomLogId: symptomEntries.symptomLogId,
          intensity: symptomEntries.intensity,
          symptomName: symptomEntries.symptomName,
        })
        .from(symptomEntries)
        .where(
          sql`${symptomEntries.symptomLogId} IN (${sql.join(curSymptomLogs.map(log => sql`${log.id}`), sql`, `)})`
        )
    : [];

  const prevSymptomLogIds = prevSymptomLogs.map(log => log.id);
  const prevSymptomEntries = prevSymptomLogIds.length > 0 
    ? await db
        .select({
          intensity: symptomEntries.intensity,
        })
        .from(symptomEntries)
        .where(
          sql`${symptomEntries.symptomLogId} IN (${sql.join(prevSymptomLogIds.map(id => sql`${id}`), sql`, `)})`
        )
    : [];

  const curIntens = curSymptomEntries.map(s => Number(s.intensity ?? 0)).filter(n => !Number.isNaN(n));
  const prevIntens = prevSymptomEntries.map(s => Number(s.intensity ?? 0)).filter(n => !Number.isNaN(n));
  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const curAvg = Math.round(avg(curIntens) * 10) / 10;
  const prevAvg = Math.round(avg(prevIntens) * 10) / 10;
  const delta = Math.round((curAvg - prevAvg) * 10) / 10; // positive = higher now
  // Flare = intensity >= 7 (tweak if you like)
  const flareCount = curIntens.filter(n => n >= 7).length;

  // --- Vitals: POTS-aware HR monitoring ---
  const vitals = await db
    .select({
      timestamp: vitalsLogs.timestamp,
      type: vitalsLogs.type,
      value: vitalsLogs.value,
      notes: vitalsLogs.notes,
    })
    .from(vitalsLogs)
    .where(
      and(
        eq(vitalsLogs.userId, userId),
        gte(vitalsLogs.timestamp, from),
        lt(vitalsLogs.timestamp, today),
        eq(vitalsLogs.type, "heart_rate")
      )
    );

  // Group by day and analyze posture-based HR changes
  const map: Record<string, { supine: number[]; standing: number[]; }> = {};
  vitals.forEach(v => {
    const k = startOfDay(v.timestamp).toISOString().slice(0, 10);
    map[k] ||= { supine: [], standing: [] };
    const notes = (v.notes || "").toLowerCase();
    const value = Number(v.value);
    if (!isNaN(value)) {
      if (notes.includes("stand") || notes.includes("sitting") || notes.includes("upright")) {
        map[k].standing.push(value);
      } else if (notes.includes("supine") || notes.includes("lying") || notes.includes("rest")) {
        map[k].supine.push(value);
      }
    }
  });

  const dailyDelta: number[] = [];
  Object.values(map).forEach(({ supine, standing }) => {
    if (supine.length && standing.length) {
      const ms = avg(standing), ls = avg(supine);
      dailyDelta.push(ms - ls);
    }
  });
  const meanHrDelta = dailyDelta.length ? Math.round(avg(dailyDelta)) : 0;

  // --- Sleep ↔ next-day pain correlation ---
  const sleeps = await db
    .select({
      bedtime: sleepLogs.bedtime,
      wakeTime: sleepLogs.wakeTime,
      totalMinutes: sleepLogs.totalMinutes,
      quality: sleepLogs.quality,
    })
    .from(sleepLogs)
    .where(
      and(
        eq(sleepLogs.userId, userId),
        gte(sleepLogs.bedtime, prevFrom),
        lt(sleepLogs.bedtime, today)
      )
    );

  // Build arrays aligned by date: sleep hours (day D) vs mean pain (day D+1)
  const byDayPain: Record<string, number[]> = {};
  curSymptomLogs.forEach((log, idx) => {
    const d = startOfDay(log.timestamp).toISOString().slice(0, 10);
    const logEntries = curSymptomEntries.filter(entry => entry.symptomLogId === log.id);
    const intensities = logEntries.map(entry => Number(entry.intensity ?? 0)).filter(n => !Number.isNaN(n));
    if (intensities.length > 0) {
      (byDayPain[d] ||= []).push(...intensities);
    }
  });

  const meanPainByDay: Record<string, number> = {};
  Object.keys(byDayPain).forEach(d => {
    meanPainByDay[d] = avg(byDayPain[d]);
  });

  const xs: number[] = []; 
  const ys: number[] = [];
  sleeps.forEach(sl => {
    const d = startOfDay(sl.bedtime).toISOString().slice(0, 10);
    const next = shiftDays(new Date(d), 1).toISOString().slice(0, 10);
    const pain = meanPainByDay[next];
    const hours = sl.totalMinutes ? sl.totalMinutes / 60 : null;
    if (hours != null && !Number.isNaN(hours) && pain != null && !Number.isNaN(pain)) {
      xs.push(hours);
      ys.push(pain);
    }
  });
  const corr = pearson(xs, ys); // r negative => more sleep, less next-day pain

  // --- Build cards (plain language) ---
  const trend =
    Math.abs(delta) < 0.2 ? "flat"
    : delta > 0 ? "up" : "down";

  const cards: InsightCard[] = [];

  // Pain trend card
  cards.push({
    id: "pain-trend",
    title: "Symptom trend",
    kind: "trend",
    period: rangeKey,
    metric: { avg: curAvg, delta, unit: "/10" },
    summary:
      trend === "flat" ? `Average intensity held steady at ${curAvg}/10.` :
      trend === "down" ? `Average intensity decreased by ${Math.abs(delta)} to ${curAvg}/10.` :
      `Average intensity increased by ${delta} to ${curAvg}/10.`,
    nudge:
      trend === "down" ? "Nice progress—consider keeping whatever helped this period." :
      trend === "flat" ? "If you'd like to experiment, try one tiny change and observe for a week." :
      "Consider a gentle check-in: hydration, a posture break, or a brief rest.",
    disclaimer: "For awareness only — not medical advice."
  });

  // Flare frequency card
  cards.push({
    id: "flare-frequency",
    title: "High-intensity episodes",
    kind: "count",
    period: rangeKey,
    metric: { value: flareCount, unit: "episodes ≥7/10" },
    summary: flareCount === 0
      ? "No high-intensity episodes recorded this period."
      : `You logged ${flareCount} high-intensity episode${flareCount > 1 ? "s" : ""} (≥7/10).`,
    nudge: "Jot a quick note on potential triggers (sleep, stress, posture) when episodes occur.",
    disclaimer: "For awareness only — not medical advice."
  });

  // HR delta card for POTS monitoring
  cards.push({
    id: "hr-delta",
    title: "Heart rate posture change",
    kind: "vitals",
    period: rangeKey,
    metric: { value: meanHrDelta, unit: "bpm increase" },
    summary: dailyDelta.length
      ? `Average increase from lying to standing was ${meanHrDelta} bpm.`
      : "Not enough posture-specific HR readings to estimate change.",
    nudge: "If helpful, capture HR when lying down and standing up to spot POTS patterns.",
    disclaimer: "For awareness only — not medical advice."
  });

  // Sleep correlation card
  const direction =
    corr.strength === "none" ? "no clear" :
    corr.r < 0 ? "a potential" : "a potential";
  const assoc =
    corr.strength === "none" ? "association" :
    corr.r < 0 ? "association where more sleep aligned with lower next-day symptoms" :
                 "association where more sleep aligned with higher next-day symptoms";

  cards.push({
    id: "sleep-correlation",
    title: "Sleep ↔ next-day symptoms",
    kind: "correlation",
    period: rangeKey,
    metric: { r: Math.round(corr.r * 100) / 100, strength: corr.strength },
    summary: `Found ${direction} ${assoc} (r=${Math.round(corr.r * 100) / 100}, ${corr.strength}).`,
    nudge: "Treat this as exploratory; try steady bed/wake times for a week and observe.",
    disclaimer: "Correlation is not causation; informational only."
  });

  return { period: rangeKey, cards };
}