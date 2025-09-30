import { db } from "../db";
import { symptomLogs, symptomEntries, vitalsLogs, sleepLogs, waterIntakeLogs } from "@shared/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

// Wave 3 - Multi-Entry: Support flexible lookback windows
type RangeWindow = "7d" | "14d" | "30d" | "60d" | "90d" | "180d" | "365d" | "today" | "last_symptom" | "up_to_now";

async function computeFromDate(userId: string, range: RangeWindow): Promise<Date> {
  const now = new Date();
  
  // Standard day ranges
  if (range.endsWith('d')) {
    const days = parseInt(range);
    const from = new Date(now);
    from.setDate(from.getDate() - days);
    return from;
  }
  
  // Today: start of current day
  if (range === 'today') {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    return startOfDay;
  }
  
  // Last symptom: from last symptom entry timestamp (Wave 3 pattern)
  if (range === 'last_symptom') {
    const lastEntry = await db
      .select({ occurredAt: symptomEntries.occurredAt })
      .from(symptomEntries)
      .where(eq(symptomEntries.userId, userId))
      .orderBy(sql`${symptomEntries.occurredAt} DESC`)
      .limit(1)
      .execute();
    
    return lastEntry[0]?.occurredAt || now;
  }
  
  // Up to now: from the very first entry ever (Wave 3 pattern)
  if (range === 'up_to_now') {
    const firstEntry = await db
      .select({ occurredAt: symptomEntries.occurredAt })
      .from(symptomEntries)
      .where(eq(symptomEntries.userId, userId))
      .orderBy(sql`${symptomEntries.occurredAt} ASC`)
      .limit(1)
      .execute();
    
    return firstEntry[0]?.occurredAt || now;
  }
  
  // Default to 30 days
  const from = new Date(now);
  from.setDate(from.getDate() - 30);
  return from;
}

export async function getUserStats(userId: string, range: RangeWindow) {
  const from = await computeFromDate(userId, range);

  // Wave 3 - Multi-Entry: Query entries directly with occurred_at
  // Get pain/symptom intensity average
  const painAvgResult = await db
    .select({ avg: sql<number>`avg(${symptomEntries.intensity})` })
    .from(symptomEntries)
    .where(and(
      eq(symptomEntries.userId, userId),
      gte(symptomEntries.occurredAt, from)
    ))
    .execute();

  const painAvg = painAvgResult[0]?.avg || 0;

  // Count flare days (intensity >= 7)
  const flareDaysResult = await db
    .selectDistinct({ date: sql<string>`date(${symptomEntries.occurredAt})` })
    .from(symptomEntries)
    .where(
      and(
        eq(symptomEntries.userId, userId),
        gte(symptomEntries.occurredAt, from),
        gte(symptomEntries.intensity, 7)
      )
    )
    .execute();

  const flareDays = flareDaysResult.length;

  // Get heart rate delta (if vitals exist)
  const hrDeltaMean = await getHrDelta(userId, from);

  // Get average sleep hours
  const sleepAvg = await getSleepHours(userId, from);

  // Get hydration trend
  const hydrationTrend = await getHydrationChange(userId, from);

  return {
    painAvg: round(painAvg, 1),
    flareDays,
    hrDeltaMean: round(hrDeltaMean, 1),
    sleepAvg: round(sleepAvg, 1),
    hydrationTrend: round(hydrationTrend, 1),
  };
}

async function getHrDelta(userId: string, from: Date): Promise<number> {
  try {
    // Get average heart rate from vitals logs where type is "heart_rate"
    const hrResult = await db
      .select({
        avg: sql<number>`avg(${vitalsLogs.value})`,
      })
      .from(vitalsLogs)
      .where(
        and(
          eq(vitalsLogs.userId, userId),
          gte(vitalsLogs.timestamp, from),
          eq(vitalsLogs.type, "heart_rate")
        )
      )
      .execute();

    // For now, just return average HR as we don't have supine/standing distinction
    return hrResult[0]?.avg || 0;
  } catch {
    return 0;
  }
}

async function getSleepHours(userId: string, from: Date): Promise<number> {
  try {
    // totalMinutes is stored, convert to hours
    const sleepResult = await db
      .select({ avgMinutes: sql<number>`avg(${sleepLogs.totalMinutes})` })
      .from(sleepLogs)
      .where(and(eq(sleepLogs.userId, userId), gte(sleepLogs.bedtime, from)))
      .execute();

    const avgMinutes = sleepResult[0]?.avgMinutes || 0;
    return avgMinutes / 60; // Convert minutes to hours
  } catch {
    return 0;
  }
}

async function getHydrationChange(userId: string, from: Date): Promise<number> {
  try {
    const days = Math.floor((Date.now() - from.getTime()) / (1000 * 60 * 60 * 24));
    const midpoint = new Date(from);
    midpoint.setDate(midpoint.getDate() + Math.floor(days / 2));

    // First half average
    const firstHalfResult = await db
      .select({ avg: sql<number>`avg(${waterIntakeLogs.amountMl})` })
      .from(waterIntakeLogs)
      .where(
        and(
          eq(waterIntakeLogs.userId, userId),
          gte(waterIntakeLogs.timestamp, from),
          lte(waterIntakeLogs.timestamp, midpoint)
        )
      )
      .execute();

    // Second half average
    const secondHalfResult = await db
      .select({ avg: sql<number>`avg(${waterIntakeLogs.amountMl})` })
      .from(waterIntakeLogs)
      .where(and(eq(waterIntakeLogs.userId, userId), gte(waterIntakeLogs.timestamp, midpoint)))
      .execute();

    const firstHalf = firstHalfResult[0]?.avg || 0;
    const secondHalf = secondHalfResult[0]?.avg || 0;

    if (firstHalf === 0) return 0;
    return ((secondHalf - firstHalf) / firstHalf) * 100;
  } catch {
    return 0;
  }
}
