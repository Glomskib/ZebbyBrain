import { Router } from "express";
import { eq, and, lt, desc, count, min, sql } from "drizzle-orm";
import { db } from "../db";
import { users, symptomLogs, vitalsLogs, sleepLogs, aiInteractions } from "../../shared/schema";

const router = Router();

/**
 * GET /api/user/retention-settings
 * Get current data retention settings for the authenticated user
 */
router.get("/retention-settings", async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const userResult = await db
      .select({
        symptomLogsRetentionMonths: users.symptomLogsRetentionMonths,
        vitalsLogsRetentionMonths: users.vitalsLogsRetentionMonths,
        sleepLogsRetentionMonths: users.sleepLogsRetentionMonths,
        aiInteractionsRetentionMonths: users.aiInteractionsRetentionMonths,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userResult.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json(userResult[0]);
  } catch (error) {
    console.error("Error fetching retention settings:", error);
    return res.status(500).json({ 
      error: "Failed to fetch retention settings" 
    });
  }
});

/**
 * PUT /api/user/retention-settings
 * Update data retention settings for the authenticated user
 */
router.put("/retention-settings", async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const {
      symptomLogsRetentionMonths,
      vitalsLogsRetentionMonths,
      sleepLogsRetentionMonths,
      aiInteractionsRetentionMonths,
    } = req.body;

    // Validate input
    const validateRetentionValue = (value: any) => {
      if (typeof value !== "number") return false;
      return value === -1 || (value >= 1 && value <= 120); // -1 for forever, or 1-120 months
    };

    if (
      !validateRetentionValue(symptomLogsRetentionMonths) ||
      !validateRetentionValue(vitalsLogsRetentionMonths) ||
      !validateRetentionValue(sleepLogsRetentionMonths) ||
      !validateRetentionValue(aiInteractionsRetentionMonths)
    ) {
      return res.status(400).json({ 
        error: "Invalid retention values. Must be -1 (forever) or 1-120 months." 
      });
    }

    await db
      .update(users)
      .set({
        symptomLogsRetentionMonths,
        vitalsLogsRetentionMonths,
        sleepLogsRetentionMonths,
        aiInteractionsRetentionMonths,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    console.info(JSON.stringify({
      evt: "retention_settings_updated",
      userId,
      settings: {
        symptomLogsRetentionMonths,
        vitalsLogsRetentionMonths,
        sleepLogsRetentionMonths,
        aiInteractionsRetentionMonths,
      },
      timestamp: new Date().toISOString()
    }));

    return res.json({ message: "Retention settings updated successfully" });
  } catch (error) {
    console.error("Error updating retention settings:", error);
    return res.status(500).json({ 
      error: "Failed to update retention settings" 
    });
  }
});

/**
 * GET /api/user/data-stats
 * Get data usage statistics for the authenticated user
 */
router.get("/data-stats", async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Get statistics for each data type
    const [symptomStats, vitalsStats, sleepStats, aiStats] = await Promise.all([
      // Symptom logs stats
      db
        .select({
          count: count(),
          oldestDate: min(symptomLogs.timestamp),
        })
        .from(symptomLogs)
        .where(eq(symptomLogs.userId, userId)),
      
      // Vitals logs stats  
      db
        .select({
          count: count(),
          oldestDate: min(vitalsLogs.timestamp),
        })
        .from(vitalsLogs)
        .where(eq(vitalsLogs.userId, userId)),
      
      // Sleep logs stats
      db
        .select({
          count: count(),
          oldestDate: min(sleepLogs.bedtime),
        })
        .from(sleepLogs)
        .where(eq(sleepLogs.userId, userId)),
      
      // AI interactions stats
      db
        .select({
          count: count(),
          oldestDate: min(aiInteractions.createdAt),
        })
        .from(aiInteractions)
        .where(eq(aiInteractions.userId, userId)),
    ]);

    // Calculate approximate total size (rough estimate)
    const totalRecords = 
      symptomStats[0].count + 
      vitalsStats[0].count + 
      sleepStats[0].count + 
      aiStats[0].count;
    
    // Rough estimate: 1KB per symptom log, 0.5KB per vitals/sleep, 2KB per AI interaction
    const estimatedSizeKB = 
      symptomStats[0].count * 1 + 
      vitalsStats[0].count * 0.5 + 
      sleepStats[0].count * 0.5 + 
      aiStats[0].count * 2;
    
    const formatSize = (kb: number): string => {
      if (kb < 1024) return `${Math.round(kb)} KB`;
      if (kb < 1024 * 1024) return `${Math.round(kb / 1024)} MB`;
      return `${Math.round(kb / (1024 * 1024))} GB`;
    };

    return res.json({
      symptomLogs: {
        count: symptomStats[0].count,
        oldestDate: symptomStats[0].oldestDate,
      },
      vitalsLogs: {
        count: vitalsStats[0].count,
        oldestDate: vitalsStats[0].oldestDate,
      },
      sleepLogs: {
        count: sleepStats[0].count,
        oldestDate: sleepStats[0].oldestDate,
      },
      aiInteractions: {
        count: aiStats[0].count,
        oldestDate: aiStats[0].oldestDate,
      },
      totalSize: formatSize(estimatedSizeKB),
    });
  } catch (error) {
    console.error("Error fetching data stats:", error);
    return res.status(500).json({ 
      error: "Failed to fetch data statistics" 
    });
  }
});

/**
 * POST /api/user/cleanup-old-data
 * Manually trigger cleanup of old data based on retention settings
 */
router.post("/cleanup-old-data", async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Get user's retention settings
    const userResult = await db
      .select({
        symptomLogsRetentionMonths: users.symptomLogsRetentionMonths,
        vitalsLogsRetentionMonths: users.vitalsLogsRetentionMonths,
        sleepLogsRetentionMonths: users.sleepLogsRetentionMonths,
        aiInteractionsRetentionMonths: users.aiInteractionsRetentionMonths,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userResult.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const retentionSettings = userResult[0];
    const now = new Date();
    let deletedRecords = 0;

    // Helper function to calculate cutoff date
    const getCutoffDate = (months: number): Date | null => {
      if (months === -1) return null; // Keep forever
      const cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - months);
      return cutoff;
    };

    // Clean up symptom logs
    const symptomCutoff = getCutoffDate(retentionSettings.symptomLogsRetentionMonths);
    if (symptomCutoff) {
      const deletedSymptoms = await db
        .delete(symptomLogs)
        .where(
          and(
            eq(symptomLogs.userId, userId),
            lt(symptomLogs.timestamp, symptomCutoff)
          )
        );
      deletedRecords += deletedSymptoms.rowCount || 0;
    }

    // Clean up vitals logs
    const vitalsCutoff = getCutoffDate(retentionSettings.vitalsLogsRetentionMonths);
    if (vitalsCutoff) {
      const deletedVitals = await db
        .delete(vitalsLogs)
        .where(
          and(
            eq(vitalsLogs.userId, userId),
            lt(vitalsLogs.timestamp, vitalsCutoff)
          )
        );
      deletedRecords += deletedVitals.rowCount || 0;
    }

    // Clean up sleep logs
    const sleepCutoff = getCutoffDate(retentionSettings.sleepLogsRetentionMonths);
    if (sleepCutoff) {
      const deletedSleep = await db
        .delete(sleepLogs)
        .where(
          and(
            eq(sleepLogs.userId, userId),
            lt(sleepLogs.bedtime, sleepCutoff)
          )
        );
      deletedRecords += deletedSleep.rowCount || 0;
    }

    // Clean up AI interactions
    const aiCutoff = getCutoffDate(retentionSettings.aiInteractionsRetentionMonths);
    if (aiCutoff) {
      const deletedAI = await db
        .delete(aiInteractions)
        .where(
          and(
            eq(aiInteractions.userId, userId),
            lt(aiInteractions.createdAt, aiCutoff)
          )
        );
      deletedRecords += deletedAI.rowCount || 0;
    }

    console.info(JSON.stringify({
      evt: "manual_data_cleanup",
      userId,
      deletedRecords,
      retentionSettings,
      timestamp: new Date().toISOString()
    }));

    return res.json({
      message: `Successfully cleaned up ${deletedRecords} old records`,
      deletedRecords,
    });
  } catch (error) {
    console.error("Error cleaning up data:", error);
    return res.status(500).json({ 
      error: "Failed to clean up old data" 
    });
  }
});

export default router;