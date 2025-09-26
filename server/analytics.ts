import { desc, sql, and, gte, lte } from "drizzle-orm";
import { db } from "./db";
import { symptomLogs, vitalsLogs, sleepLogs, SymptomLog, VitalsLog, SleepLog } from "@shared/schema";

export interface AnalyticsTimeframe {
  days: number;
  label: string;
}

export const TIMEFRAMES: AnalyticsTimeframe[] = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" }
];

export interface TrendData {
  period: string;
  value: number;
  change: number; // Percentage change from previous period
}

export interface FlareData {
  frequency: number; // Flares per week
  averageIntensity: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  lastFlareDate?: Date;
}

export interface HeartRateInsight {
  averageResting: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  correlationWithSymptoms: number; // -1 to 1
  peakTimes: string[]; // Times of day with highest HR
}

export interface SleepInsight {
  averageHours: number;
  quality: number; // 1-10
  trend: 'improving' | 'stable' | 'declining';
  correlationWithSymptoms: number;
}

export interface InsightCard {
  id: string;
  title: string;
  value: string;
  trend: 'up' | 'down' | 'stable';
  trendValue: string;
  description: string;
  actionableInsight: string;
  category: 'symptoms' | 'vitals' | 'sleep' | 'general';
  severity: 'low' | 'medium' | 'high';
}

// Calculate symptom trends over time periods
export async function calculateSymptomTrends(userId: string, timeframe: AnalyticsTimeframe): Promise<TrendData[]> {
  const endDate = new Date();
  const startDate = new Date(Date.now() - timeframe.days * 24 * 60 * 60 * 1000);
  
  const logs = await db
    .select()
    .from(symptomLogs)
    .where(
      and(
        sql`${symptomLogs.userId} = ${userId}`,
        gte(symptomLogs.timestamp, startDate),
        lte(symptomLogs.timestamp, endDate)
      )
    )
    .orderBy(desc(symptomLogs.timestamp));

  if (logs.length === 0) {
    return [];
  }

  // Group by weeks for trend analysis
  const weeklyData: { [week: string]: { count: number; totalIntensity: number } } = {};
  
  logs.forEach((log: SymptomLog) => {
    const weekStart = getWeekStart(log.timestamp);
    const weekKey = weekStart.toISOString().split('T')[0];
    
    if (!weeklyData[weekKey]) {
      weeklyData[weekKey] = { count: 0, totalIntensity: 0 };
    }
    
    weeklyData[weekKey].count += 1;
    weeklyData[weekKey].totalIntensity += log.intensity;
  });

  // Convert to trend data with percentage changes
  const weeks = Object.keys(weeklyData).sort();
  return weeks.map((week, index) => {
    const current = weeklyData[week];
    const avgIntensity = current.totalIntensity / current.count;
    
    let change = 0;
    if (index > 0) {
      const previous = weeklyData[weeks[index - 1]];
      const prevAvg = previous.totalIntensity / previous.count;
      change = ((avgIntensity - prevAvg) / prevAvg) * 100;
    }
    
    return {
      period: week,
      value: Math.round(avgIntensity * 10) / 10,
      change: Math.round(change * 10) / 10
    };
  });
}

// Calculate flare frequency and patterns
export async function calculateFlareData(userId: string, timeframe: AnalyticsTimeframe): Promise<FlareData> {
  const endDate = new Date();
  const startDate = new Date(Date.now() - timeframe.days * 24 * 60 * 60 * 1000);
  
  const logs = await db
    .select()
    .from(symptomLogs)
    .where(
      and(
        sql`${symptomLogs.userId} = ${userId}`,
        gte(symptomLogs.timestamp, startDate),
        lte(symptomLogs.timestamp, endDate),
        gte(symptomLogs.intensity, 7) // Consider intensity 7+ as flares
      )
    )
    .orderBy(desc(symptomLogs.timestamp));

  const flareCount = logs.length;
  const weeksInPeriod = timeframe.days / 7;
  const frequency = flareCount / weeksInPeriod;
  
  const averageIntensity = logs.length > 0 
    ? logs.reduce((sum: number, log: SymptomLog) => sum + log.intensity, 0) / logs.length 
    : 0;

  // Determine trend by comparing first and last half of period
  const midpoint = Math.floor(logs.length / 2);
  const recentFlares = logs.slice(0, midpoint);
  const olderFlares = logs.slice(midpoint);
  
  let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';
  if (recentFlares.length > olderFlares.length * 1.2) {
    trend = 'increasing';
  } else if (recentFlares.length < olderFlares.length * 0.8) {
    trend = 'decreasing';
  }

  return {
    frequency: Math.round(frequency * 10) / 10,
    averageIntensity: Math.round(averageIntensity * 10) / 10,
    trend,
    lastFlareDate: logs.length > 0 ? logs[0].timestamp : undefined
  };
}

// Calculate heart rate insights and correlations
export async function calculateHeartRateInsights(userId: string, timeframe: AnalyticsTimeframe): Promise<HeartRateInsight | null> {
  const endDate = new Date();
  const startDate = new Date(Date.now() - timeframe.days * 24 * 60 * 60 * 1000);
  
  const hrLogs = await db
    .select()
    .from(vitalsLogs)
    .where(
      and(
        sql`${vitalsLogs.userId} = ${userId}`,
        sql`${vitalsLogs.type} = 'heart_rate'`,
        gte(vitalsLogs.timestamp, startDate),
        lte(vitalsLogs.timestamp, endDate)
      )
    )
    .orderBy(desc(vitalsLogs.timestamp));

  if (hrLogs.length === 0) {
    return null;
  }

  // Calculate average resting HR (assuming manual entries or sleep-time readings are resting)
  const restingHR = hrLogs
    .filter((log: VitalsLog) => log.source === 'manual' || getHourFromTimestamp(log.timestamp) < 8)
    .map((log: VitalsLog) => parseFloat(log.value.toString()));
  
  const averageResting = restingHR.length > 0 
    ? restingHR.reduce((sum: number, hr: number) => sum + hr, 0) / restingHR.length 
    : 0;

  // Calculate trend - safely handle sparse data
  let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';
  if (restingHR.length >= 2) {
    const midpoint = Math.floor(restingHR.length / 2);
    const recentReadings = restingHR.slice(0, midpoint);
    const olderReadings = restingHR.slice(midpoint);
    
    const recentAvg = recentReadings.length > 0 
      ? recentReadings.reduce((sum: number, hr: number) => sum + hr, 0) / recentReadings.length 
      : 0;
    const olderAvg = olderReadings.length > 0 
      ? olderReadings.reduce((sum: number, hr: number) => sum + hr, 0) / olderReadings.length 
      : 0;
    
    if (recentAvg > 0 && olderAvg > 0) {
      if (recentAvg > olderAvg * 1.05) {
        trend = 'increasing';
      } else if (recentAvg < olderAvg * 0.95) {
        trend = 'decreasing';
      }
    }
  }

  // Find peak times (simplified - just look at hourly averages)
  const hourlyHR: { [hour: number]: number[] } = {};
  hrLogs.forEach((log: VitalsLog) => {
    const hour = getHourFromTimestamp(log.timestamp);
    if (!hourlyHR[hour]) hourlyHR[hour] = [];
    hourlyHR[hour].push(parseFloat(log.value.toString()));
  });

  const hourlyAverages = Object.entries(hourlyHR)
    .map(([hour, readings]) => ({
      hour: parseInt(hour),
      avg: readings.reduce((sum, hr) => sum + hr, 0) / readings.length
    }))
    .sort((a, b) => b.avg - a.avg);

  const peakTimes = hourlyAverages
    .slice(0, 2)
    .map(({ hour }) => `${hour}:00`)
    .sort();

  return {
    averageResting: Math.round(averageResting),
    trend,
    correlationWithSymptoms: 0, // TODO: Implement correlation calculation
    peakTimes
  };
}

// Calculate sleep insights
export async function calculateSleepInsights(userId: string, timeframe: AnalyticsTimeframe): Promise<SleepInsight | null> {
  const endDate = new Date();
  const startDate = new Date(Date.now() - timeframe.days * 24 * 60 * 60 * 1000);
  
  const sleepData = await db
    .select()
    .from(sleepLogs)
    .where(
      and(
        sql`${sleepLogs.userId} = ${userId}`,
        gte(sleepLogs.bedtime, startDate),
        lte(sleepLogs.bedtime, endDate)
      )
    )
    .orderBy(desc(sleepLogs.bedtime));

  if (sleepData.length === 0) {
    return null;
  }

  const averageHours = sleepData.reduce((sum: number, log: SleepLog) => sum + log.totalMinutes, 0) / sleepData.length / 60;
  const qualityLogs = sleepData.filter((log: SleepLog) => log.quality);
  const averageQuality = qualityLogs.length > 0
    ? qualityLogs.reduce((sum: number, log: SleepLog) => sum + (log.quality || 0), 0) / qualityLogs.length
    : 0;

  // Calculate trend based on recent vs older data - safely handle sparse data
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (sleepData.length >= 2) {
    const midpoint = Math.floor(sleepData.length / 2);
    const recentSleep = sleepData.slice(0, midpoint);
    const olderSleep = sleepData.slice(midpoint);
    
    const recentAvgHours = recentSleep.length > 0 
      ? recentSleep.reduce((sum: number, log: SleepLog) => sum + log.totalMinutes, 0) / recentSleep.length / 60
      : 0;
    const olderAvgHours = olderSleep.length > 0 
      ? olderSleep.reduce((sum: number, log: SleepLog) => sum + log.totalMinutes, 0) / olderSleep.length / 60
      : 0;
    
    if (recentAvgHours > 0 && olderAvgHours > 0) {
      if (recentAvgHours > olderAvgHours * 1.1) {
        trend = 'improving';
      } else if (recentAvgHours < olderAvgHours * 0.9) {
        trend = 'declining';
      }
    }
  }

  return {
    averageHours: Math.round(averageHours * 10) / 10,
    quality: Math.round(averageQuality * 10) / 10,
    trend,
    correlationWithSymptoms: 0 // TODO: Implement correlation calculation
  };
}

// Generate actionable insights based on all data
export async function generateInsightCards(userId: string, timeframe: AnalyticsTimeframe = TIMEFRAMES[1]): Promise<InsightCard[]> {
  const [symptomTrends, flareData, hrInsights, sleepInsights] = await Promise.all([
    calculateSymptomTrends(userId, timeframe),
    calculateFlareData(userId, timeframe),
    calculateHeartRateInsights(userId, timeframe),
    calculateSleepInsights(userId, timeframe)
  ]);

  const cards: InsightCard[] = [];

  // Symptom trend card
  if (symptomTrends.length > 0) {
    const latestTrend = symptomTrends[symptomTrends.length - 1];
    const avgIntensity = latestTrend.value;
    
    cards.push({
      id: 'symptom-trend',
      title: 'Symptom Intensity',
      value: avgIntensity.toString(),
      trend: latestTrend.change > 5 ? 'up' : latestTrend.change < -5 ? 'down' : 'stable',
      trendValue: `${latestTrend.change > 0 ? '+' : ''}${latestTrend.change}%`,
      description: `Your average symptom intensity over the last ${timeframe.label}`,
      actionableInsight: getSymptomInsight(avgIntensity, latestTrend.change),
      category: 'symptoms',
      severity: avgIntensity > 7 ? 'high' : avgIntensity > 4 ? 'medium' : 'low'
    });
  }

  // Flare frequency card
  if (flareData.frequency > 0) {
    cards.push({
      id: 'flare-frequency',
      title: 'Flare Frequency',
      value: `${flareData.frequency}/wk`,
      trend: flareData.trend === 'increasing' ? 'up' : flareData.trend === 'decreasing' ? 'down' : 'stable',
      trendValue: flareData.trend,
      description: `High-intensity episodes (7+) per week`,
      actionableInsight: getFlareInsight(flareData),
      category: 'symptoms',
      severity: flareData.frequency > 2 ? 'high' : flareData.frequency > 1 ? 'medium' : 'low'
    });
  }

  // Heart rate card
  if (hrInsights) {
    cards.push({
      id: 'heart-rate',
      title: 'Resting Heart Rate',
      value: `${hrInsights.averageResting} bpm`,
      trend: hrInsights.trend === 'increasing' ? 'up' : hrInsights.trend === 'decreasing' ? 'down' : 'stable',
      trendValue: hrInsights.trend,
      description: `Your average resting heart rate over ${timeframe.label}`,
      actionableInsight: getHeartRateInsight(hrInsights),
      category: 'vitals',
      severity: hrInsights.averageResting > 90 ? 'medium' : 'low'
    });
  }

  // Sleep card
  if (sleepInsights) {
    cards.push({
      id: 'sleep-quality',
      title: 'Sleep Duration',
      value: `${sleepInsights.averageHours}h`,
      trend: sleepInsights.trend === 'improving' ? 'up' : sleepInsights.trend === 'declining' ? 'down' : 'stable',
      trendValue: sleepInsights.trend,
      description: `Your average nightly sleep over ${timeframe.label}`,
      actionableInsight: getSleepInsight(sleepInsights),
      category: 'sleep',
      severity: sleepInsights.averageHours < 6 ? 'high' : sleepInsights.averageHours < 7 ? 'medium' : 'low'
    });
  }

  return cards;
}

// Helper functions
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}

function getHourFromTimestamp(timestamp: Date): number {
  return new Date(timestamp).getHours();
}

function getSymptomInsight(intensity: number, change: number): string {
  if (change > 10) {
    return "Your symptoms have increased recently. Consider tracking triggers and discussing with your healthcare provider.";
  } else if (change < -10) {
    return "Great news! Your symptoms are trending downward. Keep up whatever you're doing well.";
  } else if (intensity > 7) {
    return "Your symptom intensity is on the higher side. Focus on gentle self-care and rest when possible.";
  } else {
    return "Your symptoms appear stable. Continue monitoring to identify helpful patterns.";
  }
}

function getFlareInsight(flareData: FlareData): string {
  if (flareData.trend === 'increasing') {
    return "Flare frequency is increasing. Consider reviewing recent changes in routine, stress, or environment.";
  } else if (flareData.trend === 'decreasing') {
    return "Flare frequency is decreasing - you're doing something right! Note what's been helpful.";
  } else if (flareData.frequency > 2) {
    return "You're experiencing frequent flares. Prioritize rest and gentle movement during better days.";
  } else {
    return "Your flare pattern appears manageable. Keep tracking to maintain this stability.";
  }
}

function getHeartRateInsight(hrInsights: HeartRateInsight): string {
  if (hrInsights.trend === 'increasing' && hrInsights.averageResting > 80) {
    return "Your resting heart rate is trending higher. Ensure adequate rest and consider stress management techniques.";
  } else if (hrInsights.trend === 'decreasing') {
    return "Your resting heart rate is improving - a positive sign for cardiovascular health.";
  } else if (hrInsights.averageResting > 90) {
    return "Your resting heart rate is elevated. Stay hydrated and prioritize gentle movement when possible.";
  } else {
    return "Your heart rate appears within normal ranges. Continue monitoring during different activities.";
  }
}

function getSleepInsight(sleepInsights: SleepInsight): string {
  if (sleepInsights.trend === 'declining' || sleepInsights.averageHours < 6) {
    return "Your sleep duration could be improved. Consider a consistent bedtime routine and limiting screen time before bed.";
  } else if (sleepInsights.trend === 'improving') {
    return "Your sleep patterns are improving! Good sleep is crucial for managing EDS symptoms.";
  } else if (sleepInsights.averageHours < 7) {
    return "Aim for 7-9 hours of sleep nightly. Quality rest helps your body repair and manage symptoms.";
  } else {
    return "Your sleep duration looks good. Focus on sleep quality and maintaining consistent sleep schedules.";
  }
}