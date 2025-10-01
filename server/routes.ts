import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { authOptional } from "./middleware/auth";
import { requireAuth } from "./middleware/requireAuth";
import authTestRoutes from "./routes/auth-test";
import billingRoutes from "./routes/billing";
import metaRoutes from "./routes/meta";
import userRoutes from "./routes/user";
import { generateEmpathicReflection, generatePersonalizedInsight } from "./openai";
import { generateInsightCards, TIMEFRAMES } from "./analytics";
import { 
  insertSymptomLogSchema,
  insertSymptomEntrySchema,
  insertWaterIntakeLogSchema,
  insertSodiumIntakeLogSchema,
  insertVitalsLogSchema,
  insertSleepLogSchema,
  insertReminderSchema,
  insertProductReviewSchema,
  products, 
  productCategories, 
  users,
  orders,
  type SymptomLog, 
  type AIInteraction,
  type VitalsLog,
  type SleepLog 
} from "@shared/schema";
import { db } from "./db";
import { z } from "zod";
import crypto from "crypto";
import Stripe from "stripe";
import { eq, and, gte, lte } from "drizzle-orm";
import { Parser } from "json2csv";
// @ts-ignore
import PdfPrinter from "pdfmake";
import { parseString } from "xml2js";
import multer from "multer";
import yauzl from "yauzl";
import { invalidateInsightsCache, logApiPerformance } from "./lib/cache";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Add optional JWT auth middleware for new routes
  app.use(authOptional);

  // Mount new enhanced routes
  app.use('/api/auth', authTestRoutes);
  app.use('/api/billing', requireAuth, billingRoutes);
  app.use('/api', metaRoutes);
  app.use('/api/user', isAuthenticated, userRoutes);
  
  // Mount insights routes with authentication
  const insightsRoutes = await import('./routes/insights');
  app.use('/api/insights', isAuthenticated, insightsRoutes.default);

  // Mount groups routes with authentication
  const groupsRoutes = await import('./routes/groups');
  app.use('/api/groups', groupsRoutes.default);

  // Mount posts routes with authentication
  const postsRoutes = await import('./routes/posts');
  app.use('/api/posts', postsRoutes.default);

  // Mount comments and reactions routes with authentication
  const commentsRoutes = await import('./routes/comments');
  app.use('/api/comments', commentsRoutes.default);

  // Mount moderation routes with authentication
  const moderationRoutes = await import('./routes/moderation');
  app.use('/api/moderation', moderationRoutes.default);

  // Mount circles routes with authentication
  const circlesRoutes = await import('./routes/circles');
  app.use('/api/circles', isAuthenticated, circlesRoutes.default);

  // Mount AI insights routes with authentication
  const aiInsightsRoutes = await import('./routes/aiInsights');
  app.use('/api/ai', isAuthenticated, aiInsightsRoutes.default);

  // Mount AI chat routes with authentication
  const aiChatRoutes = await import('./routes/aiChat');
  app.use('/api/ai', isAuthenticated, aiChatRoutes.default);

  // Mount Shopify routes
  const shopifyRoutes = await import('./routes/shopify');
  app.use('/api/shopify', shopifyRoutes.default);

  // Mount Referrals routes (Wave 2)
  const referralsRoutes = await import('./routes/referrals');
  app.use('/api/referrals', isAuthenticated, referralsRoutes.default);

  // Mount Rewards routes (Wave 2)
  const rewardsRoutes = await import('./routes/rewards');
  app.use('/api/rewards', isAuthenticated, rewardsRoutes.default);

  // Mount Reports routes (Wave 2)
  const reportsRoutes = await import('./routes/reports');
  app.use('/api/report', isAuthenticated, reportsRoutes.default);

  // Mount Herd routes (Wave 3+)
  const herdRoutes = await import('./routes/herd');
  app.use('/api/herd', isAuthenticated, herdRoutes.default);

  // Mount Exports routes (PDF v2)
  const exportsRoutes = await import('./routes/exports');
  app.use('/api/exports', isAuthenticated, exportsRoutes.default);

  // Mount Account routes (Delete, Backup, Restore)
  const accountRoutes = await import('./routes/account');
  app.use('/api/account', isAuthenticated, accountRoutes.default);

  // Configure multer for file uploads
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
  });

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // User profile routes
  app.get('/api/user/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        onboardingCompleted: user.onboardingCompleted,
        edsType: user.edsType,
        diagnosisYear: user.diagnosisYear,
        primarySymptoms: user.primarySymptoms,
        experienceLevel: user.experienceLevel,
        dailyGoals: user.dailyGoals,
      });
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ message: "Failed to fetch user profile" });
    }
  });

  app.put('/api/user/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Define schema for profile updates
      const profileUpdateSchema = z.object({
        onboardingCompleted: z.boolean().optional(),
        edsType: z.string().nullable().optional(),
        diagnosisYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
        primarySymptoms: z.array(z.string()).nullable().optional(),
        experienceLevel: z.string().nullable().optional(),
        dailyGoals: z.array(z.string()).nullable().optional(),
      });
      
      // Validate request body
      const parsed = profileUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid profile data", errors: parsed.error.errors });
      }
      
      const updatedUser = await storage.updateUserProfile(userId, parsed.data);
      
      res.json({
        id: updatedUser.id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.email,
        onboardingCompleted: updatedUser.onboardingCompleted,
        edsType: updatedUser.edsType,
        diagnosisYear: updatedUser.diagnosisYear,
        primarySymptoms: updatedUser.primarySymptoms,
        experienceLevel: updatedUser.experienceLevel,
        dailyGoals: updatedUser.dailyGoals,
      });
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ message: "Failed to update user profile" });
    }
  });

  // Enhanced symptom logging routes
  app.post('/api/symptoms', isAuthenticated, async (req: any, res) => {
    const startTime = Date.now();
    try {
      const userId = req.user.claims.sub;
      
      // Validate request body structure
      const { symptomEntries, location, ...sessionData } = req.body;
      
      // Validate symptom entries array exists and is not empty
      if (!symptomEntries || !Array.isArray(symptomEntries) || symptomEntries.length === 0) {
        return res.status(400).json({ message: "At least one symptom entry is required" });
      }
      
      // Validate session data using insertSymptomLogSchema
      const sessionSchema = insertSymptomLogSchema.omit({ userId: true });
      const sessionValidation = sessionSchema.safeParse(sessionData);
      if (!sessionValidation.success) {
        return res.status(400).json({ message: "Invalid session data", errors: sessionValidation.error.errors });
      }
      
      // Validate each symptom entry
      const entrySchema = insertSymptomEntrySchema.omit({ symptomLogId: true });
      for (const entry of symptomEntries) {
        const entryValidation = entrySchema.safeParse(entry);
        if (!entryValidation.success) {
          return res.status(400).json({ message: "Invalid symptom entry data", errors: entryValidation.error.errors });
        }
      }

      // Get weather data if location is provided (Wave 1 - FF_WEATHER)
      let weatherData = null;
      let enhancedWeatherData = null;
      if (location && location !== "Unknown") {
        // Try new enhanced weather service first (Open-Meteo, no API key)
        const { FF } = await import('./config/flags');
        if (FF.WEATHER && location.includes(',')) {
          const { fetchWeather } = await import('./services/weather');
          const [lat, lon] = location.split(',').map(Number);
          if (!isNaN(lat) && !isNaN(lon)) {
            enhancedWeatherData = await fetchWeather(lat, lon);
          }
        }
        
        // Fallback to legacy weather service
        if (!enhancedWeatherData) {
          const { getCurrentWeather, getWeatherByCity } = await import('./weatherService');
          if (location.includes(',')) {
            const [lat, lon] = location.split(',').map(Number);
            if (!isNaN(lat) && !isNaN(lon)) {
              weatherData = await getCurrentWeather(lat, lon);
            }
          } else {
            weatherData = await getWeatherByCity(location);
          }
        }
      }

      // Create the main symptom log with contextual data
      const symptomLogData = {
        userId,
        timestamp: new Date(sessionData.timestamp),
        notes: sessionData.notes || null,
        waterIntakeCurrentMl: sessionData.waterIntakeCurrentMl || null,
        heartRateBpm: sessionData.heartRateBpm || null, 
        sodiumIntakeCurrentMg: sessionData.sodiumIntakeCurrentMg || null,
        // Legacy weather fields (backward compatibility)
        weatherTemp: weatherData?.temperature ? weatherData.temperature.toString() : null,
        weatherCondition: weatherData?.condition || null,
        weatherLocation: weatherData?.location || null,
        // Enhanced weather fields (Wave 1 - FF_WEATHER)
        weatherTempC: enhancedWeatherData?.tempC ? enhancedWeatherData.tempC.toString() : null,
        weatherText: enhancedWeatherData?.text || null,
        weatherObservedAt: enhancedWeatherData?.observedAt || null,
        lat: enhancedWeatherData?.lat ? enhancedWeatherData.lat.toString() : null,
        lon: enhancedWeatherData?.lon ? enhancedWeatherData.lon.toString() : null,
        weatherSource: enhancedWeatherData?.source || null,
        // Legacy fields for backward compatibility
        symptoms: symptomEntries.map((entry: any) => entry.symptomName),
        intensity: Math.round(symptomEntries.reduce((sum: number, entry: any) => sum + entry.intensity, 0) / symptomEntries.length)
      };

      const symptomLog = await storage.createSymptomLog(symptomLogData);

      // Create individual symptom entries (Wave 3 - Multi-Entry with precise timestamps)
      console.log('Creating symptom entries with data:', JSON.stringify(symptomEntries, null, 2));
      const createdEntries = [];
      for (const entry of symptomEntries) {
        console.log(`Creating symptom entry: ${entry.symptomName} with intensity ${entry.intensity}`);
        const symptomEntry = await storage.createSymptomEntry({
          userId, // Wave 3: Direct user association for flatter queries
          symptomLogId: symptomLog.id,
          symptomName: entry.symptomName,
          intensity: entry.intensity,
          notes: entry.notes || null,
          bodyPart: entry.bodyPart || null,
          side: entry.side || null,
          // Wave 3: Per-entry timestamp (defaults to session timestamp if not provided)
          occurredAt: entry.occurredAt ? new Date(entry.occurredAt) : new Date(sessionData.timestamp),
          // Wave 3: Per-entry weather data (same as session for entries logged together)
          weatherTempC: enhancedWeatherData?.tempC ? enhancedWeatherData.tempC.toString() : null,
          weatherText: enhancedWeatherData?.text || null,
          weatherObservedAt: enhancedWeatherData?.observedAt || null,
          lat: enhancedWeatherData?.lat ? enhancedWeatherData.lat.toString() : null,
          lon: enhancedWeatherData?.lon ? enhancedWeatherData.lon.toString() : null,
          weatherSource: enhancedWeatherData?.source || null,
          // Wave 3: Per-entry vitals context (same as session for entries logged together)
          waterIntakeCurrentMl: sessionData.waterIntakeCurrentMl || null,
          heartRateBpm: sessionData.heartRateBpm || null,
          sodiumIntakeCurrentMg: sessionData.sodiumIntakeCurrentMg || null,
        } as any);
        console.log('Created symptom entry:', JSON.stringify(symptomEntry, null, 2));
        createdEntries.push(symptomEntry);
      }

      // Generate analytical AI reflection asynchronously
      const symptomSummary = symptomEntries.map((entry: any) => `${entry.symptomName} (${entry.intensity}/10)`).join(", ");
      
      // Import the new analytical function
      const { generateAnalyticalReflection } = await import('./openai');
      
      generateAnalyticalReflection(
        symptomEntries.map((entry: any) => ({
          name: entry.symptomName,
          intensity: entry.intensity,
          notes: entry.notes
        })),
        {
          heartRate: sessionData.heartRateBpm,
          waterIntake: sessionData.waterIntakeCurrentMl,
          sodiumIntake: sessionData.sodiumIntakeCurrentMg,
          weatherTemp: weatherData?.temperature,
          weatherCondition: weatherData?.condition,
          timestamp: new Date(sessionData.timestamp),
          sessionNotes: sessionData.notes
        }
      ).then(async (aiResponse) => {
        await storage.updateSymptomLogReflection(symptomLog.id, aiResponse.reflection);
        
        await storage.createAIInteraction(
          userId,
          symptomLog.id,
          `Symptoms: ${symptomSummary}`,
          aiResponse.reflection,
          aiResponse.sentiment
        );
      }).catch(error => {
        console.error("Failed to generate AI reflection:", error);
      });

      // Invalidate insights cache after successful creation
      await invalidateInsightsCache(userId);
      
      // Log performance metrics
      logApiPerformance(req, res, startTime, false);
      
      res.json({ 
        ...symptomLog, 
        symptomEntries: createdEntries,
        weatherData 
      });
    } catch (error) {
      console.error("Error creating symptom log:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create symptom log" });
    }
  });

  app.get('/api/symptoms', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const limit = parseInt(req.query.limit as string) || 50;
      const withEntries = req.query.withEntries === 'true';
      
      if (withEntries) {
        const symptoms = await storage.getUserSymptomLogsWithEntries(userId, limit);
        res.json(symptoms);
      } else {
        const symptoms = await storage.getUserSymptomLogs(userId, limit);
        res.json(symptoms);
      }
    } catch (error) {
      console.error("Error fetching symptom logs:", error);
      res.status(500).json({ message: "Failed to fetch symptom logs" });
    }
  });

  // Wave 3 - Multi-Entry: Get symptoms grouped by day with timezone support
  app.get('/api/symptoms/grouped', isAuthenticated, async (req: any, res) => {
    try {
      const { fromZonedTime } = await import('date-fns-tz');
      
      const userId = req.user.claims.sub;
      const tz = (req.query.tz as string) || 'UTC'; // Default to UTC if not provided
      const limit = parseInt(req.query.limit as string) || 50;

      // Validate timezone
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
      } catch (error) {
        return res.status(400).json({ message: `Invalid timezone: ${tz}` });
      }

      // Parse and normalize from/to dates using the user's timezone
      let from: Date | null = null;
      let to: Date | null = null;

      if (req.query.from) {
        const fromStr = req.query.from as string;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr)) {
          return res.status(400).json({ message: `Invalid date format for 'from'. Expected YYYY-MM-DD, got: ${fromStr}` });
        }
        // Convert start of day in user's timezone to UTC
        from = fromZonedTime(`${fromStr}T00:00:00`, tz);
      }

      if (req.query.to) {
        const toStr = req.query.to as string;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
          return res.status(400).json({ message: `Invalid date format for 'to'. Expected YYYY-MM-DD, got: ${toStr}` });
        }
        // Convert end of day in user's timezone to UTC
        to = fromZonedTime(`${toStr}T23:59:59.999`, tz);
      }

      const grouped = await storage.getUserSymptomEntriesGrouped(userId, { from, to, tz, limit });
      res.json(grouped);
    } catch (error) {
      console.error("Error fetching grouped symptom entries:", error);
      res.status(500).json({ message: "Failed to fetch grouped symptom entries" });
    }
  });

  app.get('/api/symptoms/:id', isAuthenticated, async (req: any, res) => {
    try {
      const withEntries = req.query.withEntries === 'true';
      
      if (withEntries) {
        const symptomLog = await storage.getSymptomLogWithEntries(req.params.id);
        if (!symptomLog) {
          return res.status(404).json({ message: "Symptom log not found" });
        }
        
        if (symptomLog.userId !== req.user.claims.sub) {
          return res.status(403).json({ message: "Unauthorized" });
        }
        
        
        res.json(symptomLog);
      } else {
        const symptomLog = await storage.getSymptomLog(req.params.id);
        if (!symptomLog) {
          return res.status(404).json({ message: "Symptom log not found" });
        }
        
        if (symptomLog.userId !== req.user.claims.sub) {
          return res.status(403).json({ message: "Unauthorized" });
        }
        
        res.json(symptomLog);
      }
    } catch (error) {
      console.error("Error fetching symptom log:", error);
      res.status(500).json({ message: "Failed to fetch symptom log" });
    }
  });

  // Daily intakes endpoint
  app.get('/api/daily-intakes', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const date = req.query.date ? new Date(req.query.date) : new Date();
      
      const intakes = await storage.getUserDailyIntakes(userId, date);
      res.json(intakes);
    } catch (error) {
      console.error("Error fetching daily intakes:", error);
      res.status(500).json({ message: "Failed to fetch daily intakes" });
    }
  });

  // Water intake logging
  app.post('/api/water-intake', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate request body with Zod
      const parsed = insertWaterIntakeLogSchema.safeParse({
        ...req.body,
        userId,
        source: 'manual'
      });
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid water intake data", errors: parsed.error.errors });
      }

      const waterLog = await storage.createWaterIntakeLog(parsed.data);

      res.json(waterLog);
    } catch (error) {
      console.error("Error logging water intake:", error);
      res.status(500).json({ message: "Failed to log water intake" });
    }
  });

  // Sodium intake logging
  app.post('/api/sodium-intake', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate request body with Zod
      const parsed = insertSodiumIntakeLogSchema.safeParse({
        ...req.body,
        userId,
        source: 'manual'
      });
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid sodium intake data", errors: parsed.error.errors });
      }

      const sodiumLog = await storage.createSodiumIntakeLog(parsed.data);

      res.json(sodiumLog);
    } catch (error) {
      console.error("Error logging sodium intake:", error);
      res.status(500).json({ message: "Failed to log sodium intake" });
    }
  });

  // AI interaction routes
  app.get('/api/ai-interactions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const limit = parseInt(req.query.limit as string) || 20;
      const interactions = await storage.getUserAIInteractions(userId, limit);
      res.json(interactions);
    } catch (error) {
      console.error("Error fetching AI interactions:", error);
      res.status(500).json({ message: "Failed to fetch AI interactions" });
    }
  });

  // Update AI interaction feedback
  app.put('/api/ai-interactions/:id/feedback', isAuthenticated, async (req: any, res) => {
    try {
      const { feltUnderstood } = req.body;
      const interactionId = req.params.id;
      const userId = req.user.claims.sub;
      
      if (typeof feltUnderstood !== 'boolean') {
        return res.status(400).json({ message: "feltUnderstood must be a boolean" });
      }

      await storage.updateAIInteractionFeedback(interactionId, userId, feltUnderstood);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating AI interaction feedback:", error);
      if (error instanceof Error && error.message === "AI interaction not found or access denied") {
        return res.status(403).json({ message: "Access denied" });
      }
      res.status(500).json({ message: "Failed to update feedback" });
    }
  });

  // Vitals tracking routes
  app.post('/api/vitals', isAuthenticated, async (req: any, res) => {
    const startTime = Date.now();
    try {
      const userId = req.user.claims.sub;
      const validatedData = insertVitalsLogSchema.parse({
        ...req.body,
        userId,
      });

      const vitalsLog = await storage.createVitalsLog(validatedData);
      
      // Invalidate insights cache after successful creation
      await invalidateInsightsCache(userId);
      
      // Log performance metrics
      logApiPerformance(req, res, startTime, false);
      
      res.json(vitalsLog);
    } catch (error) {
      console.error("Error creating vitals log:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid vitals data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create vitals log" });
    }
  });

  app.get('/api/vitals', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const type = req.query.type as string;
      const limit = parseInt(req.query.limit as string) || 100;
      const vitalsLogs = await storage.getUserVitalsLogs(userId, type, limit);
      res.json(vitalsLogs);
    } catch (error) {
      console.error("Error fetching vitals logs:", error);
      res.status(500).json({ message: "Failed to fetch vitals logs" });
    }
  });

  // Sleep tracking routes
  app.post('/api/sleep', isAuthenticated, async (req: any, res) => {
    const startTime = Date.now();
    try {
      const userId = req.user.claims.sub;
      const validatedData = insertSleepLogSchema.parse({
        ...req.body,
        userId,
      });

      const sleepLog = await storage.createSleepLog(validatedData);
      
      // Invalidate insights cache after successful creation
      await invalidateInsightsCache(userId);
      
      // Log performance metrics
      logApiPerformance(req, res, startTime, false);
      
      res.json(sleepLog);
    } catch (error) {
      console.error("Error creating sleep log:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid sleep data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create sleep log" });
    }
  });

  app.get('/api/sleep', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const limit = parseInt(req.query.limit as string) || 100;
      const sleepLogs = await storage.getUserSleepLogs(userId, limit);
      res.json(sleepLogs);
    } catch (error) {
      console.error("Error fetching sleep logs:", error);
      res.status(500).json({ message: "Failed to fetch sleep logs" });
    }
  });

  // Reminder management routes
  app.get('/api/reminders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const reminders = await storage.getUserReminders(userId);
      res.json(reminders);
    } catch (error) {
      console.error("Error fetching reminders:", error);
      res.status(500).json({ message: "Failed to fetch reminders" });
    }
  });

  app.post('/api/reminders', isAuthenticated, async (req: any, res) => {
    const startTime = Date.now();
    try {
      const userId = req.user.claims.sub;
      
      // Validate request body using Zod
      const validatedData = insertReminderSchema.parse({
        ...req.body,
        userId,
      });

      const reminder = await storage.createReminder(validatedData);
      
      // Log performance metrics
      logApiPerformance(req, res, startTime, false);
      
      res.json(reminder);
    } catch (error) {
      console.error("Error creating reminder:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid reminder data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create reminder" });
    }
  });

  app.put('/api/reminders/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const reminderId = req.params.id;
      
      // Validate request body (exclude fields that shouldn't be updated directly)
      const updateSchema = insertReminderSchema.omit({ userId: true }).partial();
      const validatedData = updateSchema.parse(req.body);

      const updatedReminder = await storage.updateReminder(reminderId, userId, validatedData);
      res.json(updatedReminder);
    } catch (error) {
      console.error("Error updating reminder:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid reminder data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update reminder" });
    }
  });

  app.delete('/api/reminders/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const reminderId = req.params.id;
      
      await storage.deleteReminder(reminderId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting reminder:", error);
      res.status(500).json({ message: "Failed to delete reminder" });
    }
  });

  app.post('/api/reminders/:id/toggle', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const reminderId = req.params.id;
      const { enabled } = req.body;
      
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ message: "Enabled field must be a boolean" });
      }
      
      await storage.toggleReminderEnabled(reminderId, userId, enabled);
      res.json({ success: true });
    } catch (error) {
      console.error("Error toggling reminder:", error);
      res.status(500).json({ message: "Failed to toggle reminder" });
    }
  });

  app.post('/api/reminders/:id/snooze', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const reminderId = req.params.id;
      const { snoozeUntil } = req.body;
      
      if (!snoozeUntil) {
        return res.status(400).json({ message: "snoozeUntil date is required" });
      }
      
      const snoozeDate = new Date(snoozeUntil);
      if (isNaN(snoozeDate.getTime())) {
        return res.status(400).json({ message: "Invalid snoozeUntil date format" });
      }
      
      await storage.snoozeReminder(reminderId, userId, snoozeDate);
      res.json({ success: true });
    } catch (error) {
      console.error("Error snoozing reminder:", error);
      res.status(500).json({ message: "Failed to snooze reminder" });
    }
  });

  // Data import source management routes
  app.get('/api/import-sources', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sources = await storage.getUserDataImportSources(userId);
      res.json(sources);
    } catch (error) {
      console.error("Error fetching import sources:", error);
      res.status(500).json({ message: "Failed to fetch import sources" });
    }
  });

  app.post('/api/import-sources/google-fit/authorize', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Google Fit OAuth2 authorization URL
      const googleOAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      googleOAuthUrl.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID || '');
      googleOAuthUrl.searchParams.set('redirect_uri', `${req.protocol}://${req.get('host')}/api/import-sources/google-fit/callback`);
      googleOAuthUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/fitness.heart_rate.read https://www.googleapis.com/auth/fitness.sleep.read https://www.googleapis.com/auth/fitness.activity.read');
      googleOAuthUrl.searchParams.set('response_type', 'code');
      googleOAuthUrl.searchParams.set('state', userId);
      googleOAuthUrl.searchParams.set('access_type', 'offline');
      
      res.json({ authUrl: googleOAuthUrl.toString() });
    } catch (error) {
      console.error("Error creating Google Fit auth URL:", error);
      res.status(500).json({ message: "Failed to create authorization URL" });
    }
  });

  app.get('/api/import-sources/google-fit/callback', async (req, res) => {
    try {
      const { code, state: userId } = req.query;
      
      if (!code || !userId) {
        return res.status(400).send('Missing authorization code or user ID');
      }

      // Real Google Fit OAuth2 token exchange
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID || '',
          client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
          code: code as string,
          grant_type: 'authorization_code',
          redirect_uri: `${req.protocol}://${req.get('host')}/api/import-sources/google-fit/callback`
        })
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to exchange code for tokens');
      }

      const tokens = await tokenResponse.json();

      // Store the data import source
      const importSource = await storage.createDataImportSource({
        userId: userId as string,
        source: 'google_fit',
        isEnabled: true,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
        syncPreferences: {
          heart_rate: true,
          sleep: true,
          steps: true
        }
      });

      // Immediately sync initial data
      await syncGoogleFitData(userId as string, importSource);

      res.send(`
        <script>
          window.opener.postMessage({ success: true, source: 'google_fit' }, '*');
          window.close();
        </script>
      `);
    } catch (error) {
      console.error("Error handling Google Fit callback:", error);
      res.status(500).send('Authorization failed');
    }
  });

  // Apple Health data import (ZIP file upload)
  app.post('/api/import-sources/apple-health/upload', isAuthenticated, upload.single('healthExport'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      if (!file.originalname.endsWith('.zip')) {
        return res.status(400).json({ message: "Please upload a ZIP file from Apple Health export" });
      }

      // Extract and parse Apple Health XML from ZIP
      const xmlData = await extractAppleHealthXML(file.buffer);
      const parsedData = await parseAppleHealthXML(xmlData);
      
      // Process and import Apple Health data
      const importResults = await processAppleHealthData(userId, parsedData);
      
      res.json({
        imported: importResults.imported,
        conflicts: importResults.conflicts,
        skipped: importResults.skipped
      });
    } catch (error) {
      console.error("Error importing Apple Health data:", error);
      res.status(500).json({ message: "Failed to import Apple Health data" });
    }
  });

  // Sync data from connected sources
  app.post('/api/import-sources/:sourceId/sync', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sourceId } = req.params;
      
      // Get the import source
      const sources = await storage.getUserDataImportSources(userId);
      const source = sources.find(s => s.id === sourceId);
      
      if (!source || !source.isEnabled) {
        return res.status(404).json({ message: "Data source not found or disabled" });
      }

      let syncResults;
      if (source.source === 'google_fit') {
        syncResults = await syncGoogleFitData(userId, source);
      } else {
        return res.status(400).json({ message: "Unsupported data source" });
      }

      // Update last sync time
      await storage.updateDataImportSource(sourceId, {
        lastSync: new Date()
      });

      res.json(syncResults);
    } catch (error) {
      console.error("Error syncing data:", error);
      res.status(500).json({ message: "Failed to sync data" });
    }
  });

  // Import conflicts management
  app.get('/api/import-conflicts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const status = req.query.status as string;
      const conflicts = await storage.getUserImportConflicts(userId, status);
      res.json(conflicts);
    } catch (error) {
      console.error("Error fetching import conflicts:", error);
      res.status(500).json({ message: "Failed to fetch import conflicts" });
    }
  });

  app.post('/api/import-conflicts/:conflictId/resolve', isAuthenticated, async (req: any, res) => {
    try {
      const { conflictId } = req.params;
      const { resolution } = req.body; // "keep_existing", "use_import", "merge"
      
      await storage.resolveImportConflict(conflictId, resolution);
      res.json({ success: true });
    } catch (error) {
      console.error("Error resolving import conflict:", error);
      res.status(500).json({ message: "Failed to resolve conflict" });
    }
  });

  app.get('/api/insights', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const recentSymptoms = await storage.getUserSymptomLogs(userId, 7); // Last 7 entries
      
      const insight = await generatePersonalizedInsight(
        recentSymptoms.map(log => ({
          symptoms: log.symptoms,
          intensity: log.intensity,
          timestamp: log.timestamp
        }))
      );
      
      res.json({ insight });
    } catch (error) {
      console.error("Error generating insight:", error);
      res.status(500).json({ message: "Failed to generate insight" });
    }
  });

  // Analytics endpoint for Insight Cards
  app.get('/api/analytics/insights', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const timeframeDays = parseInt(req.query.timeframe as string) || 30;
      
      // Find matching timeframe or default to 30 days
      const timeframe = TIMEFRAMES.find(tf => tf.days === timeframeDays) || TIMEFRAMES[1];
      
      const insightCards = await generateInsightCards(userId, timeframe);
      
      res.json({
        cards: insightCards,
        timeframe: timeframe.label,
        availableTimeframes: TIMEFRAMES
      });
    } catch (error) {
      console.error("Error generating analytics insights:", error);
      res.status(500).json({ message: "Failed to generate analytics insights" });
    }
  });

  // Product and marketplace routes
  app.get('/api/product-categories', async (req, res) => {
    try {
      const categories = await storage.getAllProductCategories();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching product categories:", error);
      res.status(500).json({ message: "Failed to fetch product categories" });
    }
  });

  app.get('/api/products', async (req, res) => {
    try {
      const categoryId = req.query.categoryId as string;
      const products = await storage.getProductsByCategory(categoryId);
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.get('/api/products/:id', async (req, res) => {
    try {
      const product = await storage.getProduct(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  // User favorites routes
  app.post('/api/favorites/:productId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const productId = req.params.productId;
      
      const isFavorited = await storage.toggleUserFavorite(userId, productId);
      res.json({ isFavorited });
    } catch (error) {
      console.error("Error toggling favorite:", error);
      res.status(500).json({ message: "Failed to update favorites" });
    }
  });

  app.get('/api/favorites', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const favorites = await storage.getUserFavorites(userId);
      res.json(favorites);
    } catch (error) {
      console.error("Error fetching favorites:", error);
      res.status(500).json({ message: "Failed to fetch favorites" });
    }
  });

  // Product review routes
  app.post('/api/reviews', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const reviewData = insertProductReviewSchema.omit({ id: true, createdAt: true, updatedAt: true }).parse(req.body);
      
      // Ensure the review belongs to the authenticated user
      const review = await storage.createProductReview({
        ...reviewData,
        userId,
        isApproved: false, // Reviews need approval by default
        helpfulCount: 0
      });
      
      res.status(201).json(review);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid review data", errors: error.errors });
      }
      console.error("Error creating review:", error);
      res.status(500).json({ message: "Failed to create review" });
    }
  });

  app.get('/api/reviews/:productId', async (req, res) => {
    try {
      const productId = req.params.productId;
      const reviews = await storage.getProductReviews(productId);
      res.json(reviews);
    } catch (error) {
      console.error("Error fetching reviews:", error);
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });

  app.get('/api/reviews/user/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const requesterId = req.user.claims.sub;
      const targetUserId = req.params.userId;
      
      // Users can only view their own reviews
      if (requesterId !== targetUserId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const reviews = await storage.getUserReviews(targetUserId);
      res.json(reviews);
    } catch (error) {
      console.error("Error fetching user reviews:", error);
      res.status(500).json({ message: "Failed to fetch user reviews" });
    }
  });

  app.post('/api/reviews/:reviewId/helpful', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const reviewId = req.params.reviewId;
      const { isHelpful } = req.body;
      
      if (typeof isHelpful !== 'boolean') {
        return res.status(400).json({ message: "isHelpful must be a boolean" });
      }
      
      await storage.markReviewHelpful(userId, reviewId, isHelpful);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking review helpful:", error);
      res.status(500).json({ message: "Failed to update review helpfulness" });
    }
  });

  app.put('/api/reviews/:reviewId/approve', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Check if user has admin/moderator permissions
      // For now, implement a simple admin check based on email domain or specific user
      // In production, this should be a proper role-based system
      const isAdmin = user?.email?.endsWith('@zebbysworld.com') || 
                     user?.email === 'admin@example.com' ||
                     process.env.NODE_ENV === 'development'; // Allow in development
      
      if (!isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin privileges required for review moderation." });
      }
      
      const { isApproved, moderatorNotes } = req.body;
      const reviewId = req.params.reviewId;
      
      if (typeof isApproved !== 'boolean') {
        return res.status(400).json({ message: "isApproved must be a boolean" });
      }
      
      await storage.updateReviewApproval(reviewId, isApproved, moderatorNotes);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating review approval:", error);
      res.status(500).json({ message: "Failed to update review approval" });
    }
  });

  // Shopping cart routes
  app.post('/api/cart', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { productId, quantity = 1 } = req.body;
      
      if (!productId) {
        return res.status(400).json({ message: "Product ID is required" });
      }

      // Check if item already exists in cart
      const existingItems = await storage.getCartItems(userId);
      const existingItem = existingItems.find(item => item.productId === productId);
      
      if (existingItem) {
        // Update quantity if item exists
        await storage.updateCartItem(existingItem.id, userId, existingItem.quantity + quantity);
      } else {
        // Create new cart item
        await storage.createCartItem({ userId, productId, quantity });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding to cart:", error);
      res.status(500).json({ message: "Failed to add item to cart" });
    }
  });

  app.get('/api/cart', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const cartItems = await storage.getCartItems(userId);
      res.json(cartItems);
    } catch (error) {
      console.error("Error fetching cart:", error);
      res.status(500).json({ message: "Failed to fetch cart" });
    }
  });

  app.put('/api/cart/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { quantity } = req.body;
      const cartItemId = req.params.id;
      
      if (typeof quantity !== 'number' || quantity < 1) {
        return res.status(400).json({ message: "Quantity must be a positive number" });
      }

      await storage.updateCartItem(cartItemId, userId, quantity);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating cart item:", error);
      res.status(500).json({ message: "Failed to update cart item" });
    }
  });

  app.delete('/api/cart/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const cartItemId = req.params.id;
      
      await storage.deleteCartItem(cartItemId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing cart item:", error);
      res.status(500).json({ message: "Failed to remove cart item" });
    }
  });

  app.delete('/api/cart', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.clearCart(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error clearing cart:", error);
      res.status(500).json({ message: "Failed to clear cart" });
    }
  });

  // Product checkout with Stripe
  app.post('/api/checkout/products', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      
      if (!user[0]) {
        return res.status(401).json({ error: "User not found" });
      }

      // Get user's cart items
      const cartItems = await storage.getCartItems(userId);
      if (cartItems.length === 0) {
        return res.status(400).json({ error: "Cart is empty" });
      }

      // Check if we're in test mode (no valid Stripe configuration)
      if (!stripe) {
        console.log("Test mode: Simulating product checkout session creation");
        return res.json({ 
          url: "https://checkout.stripe.com/test-product-session-url",
          test_mode: true,
          message: "Test mode: Real Stripe integration requires valid API keys" 
        });
      }

      console.log("Creating Stripe checkout session for products for user:", userId);

      let customerId = user[0].stripeCustomerId;
      
      // Create Stripe customer if doesn't exist
      if (!customerId) {
        const customer = await stripe.customers.create({ 
          email: user[0].email || undefined,
          metadata: { userId: userId }
        });
        customerId = customer.id;
        
        // Update user with Stripe customer ID
        await db.update(users)
          .set({ stripeCustomerId: customerId })
          .where(eq(users.id, userId));
      }

      // Calculate total and prepare line items
      let totalAmount = 0;
      const lineItems = cartItems.map(item => {
        const price = parseFloat(item.product.price);
        totalAmount += price * item.quantity;
        
        return {
          price_data: {
            currency: 'usd',
            product_data: {
              name: item.product.name,
              description: item.product.description || undefined,
              images: item.product.imageUrl ? [item.product.imageUrl] : undefined,
            },
            unit_amount: Math.round(price * 100), // Convert to cents
          },
          quantity: item.quantity,
        };
      });

      // Create pending order
      const pendingOrder = await storage.createOrder({
        userId,
        status: 'pending',
        totalAmount: totalAmount.toString(),
        currency: 'usd',
      });

      // Add order items
      for (const item of cartItems) {
        const unitPrice = parseFloat(item.product.price);
        await storage.createOrderItem({
          orderId: pendingOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: unitPrice.toString(),
          totalPrice: (unitPrice * item.quantity).toString(),
        });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: customerId,
        line_items: lineItems,
        success_url: `${req.protocol}://${req.get('host')}/marketplace?purchase=success&order=${pendingOrder.id}`,
        cancel_url: `${req.protocol}://${req.get('host')}/marketplace?purchase=cancel`,
        metadata: { 
          userId: userId,
          orderId: pendingOrder.id,
          type: 'product_purchase'
        }
      });

      // Update order with Stripe session ID
      await storage.updateOrderStatus(pendingOrder.id, 'pending');
      await db.update(orders)
        .set({ stripeSessionId: session.id })
        .where(eq(orders.id, pendingOrder.id));

      res.json({ url: session.url, orderId: pendingOrder.id });
    } catch (error) {
      console.error("Error creating product checkout session:", error);
      
      // Handle Stripe authentication errors gracefully
      if ((error as any).type === 'StripeAuthenticationError' || 
          (error as Error).message.includes('Invalid API Key')) {
        console.log("Stripe authentication failed, returning test mode response");
        return res.json({ 
          url: "https://checkout.stripe.com/test-product-session-url",
          test_mode: true,
          message: "Test mode: Stripe authentication failed" 
        });
      }
      
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  // Order routes
  app.get('/api/orders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const orders = await storage.getOrders(userId);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.get('/api/orders/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const orderId = req.params.id;
      
      const order = await storage.getOrder(orderId, userId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      res.json(order);
    } catch (error) {
      console.error("Error fetching order:", error);
      res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  // Initialize default data route (for development)
  app.post('/api/init-data', async (req, res) => {
    try {
      // Create default product categories
      const categories = [
        { name: "Braces & Support", description: "Joint braces, compression garments, and mobility aids", icon: "🦴" },
        { name: "Supplements", description: "Vitamins, collagen, and nutritional support", icon: "💊" },
        { name: "Electrolytes", description: "Hydration solutions for POTS and dysautonomia", icon: "💧" },
        { name: "Tools & Aids", description: "Mobility tools, ergonomic aids, and daily living support", icon: "🛠️" },
        { name: "Courses", description: "Educational resources and self-advocacy training", icon: "📚" },
      ];

      // Check for existing categories first
      const existingCategories = await storage.getAllProductCategories();
      const createdCategories = [];
      
      for (const category of categories) {
        const existing = existingCategories.find(c => c.name === category.name);
        if (existing) {
          createdCategories.push(existing);
        } else {
          try {
            const created = await storage.createProductCategory(category);
            createdCategories.push(created);
          } catch (error) {
            console.error(`Error creating category ${category.name}:`, error);
          }
        }
      }

      // Create sample products for each category
      const productData = [
        // Braces & Support
        {
          categoryName: "Braces & Support",
          products: [
            {
              name: "Copper Compression Knee Brace",
              description: "Medical-grade knee support with copper-infused fabric for pain relief and joint stability. Perfect for EDS joint hypermobility.",
              price: "29.99",
              originalPrice: "39.99",
              discountPercentage: 25,
              imageUrl: "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=400"
            },
            {
              name: "Wrist Support Braces (Pair)",
              description: "Lightweight carpal tunnel braces designed for EDS patients. Provides gentle support without restricting movement.",
              price: "24.99",
              originalPrice: null,
              discountPercentage: null,
              imageUrl: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400"
            },
            {
              name: "Compression Socks for POTS",
              description: "20-30mmHg graduated compression socks to improve circulation and reduce POTS symptoms.",
              price: "19.99",
              originalPrice: "24.99",
              discountPercentage: 20,
              imageUrl: "https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=400"
            }
          ]
        },
        // Supplements
        {
          categoryName: "Supplements",
          products: [
            {
              name: "Collagen Peptides for Joint Health",
              description: "Type I & III collagen peptides specifically formulated for connective tissue support. Essential for EDS management.",
              price: "34.99",
              originalPrice: "44.99",
              discountPercentage: 22,
              imageUrl: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400"
            },
            {
              name: "Magnesium Glycinate 400mg",
              description: "Gentle, bioavailable magnesium for muscle cramps, sleep support, and nervous system function. EDS-friendly formulation.",
              price: "18.99",
              originalPrice: null,
              discountPercentage: null,
              imageUrl: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400"
            },
            {
              name: "Vitamin D3 + K2 Complex",
              description: "High-potency vitamin D3 with K2 for bone health and immune support. Important for EDS patients with frequent deficiencies.",
              price: "22.99",
              originalPrice: "27.99",
              discountPercentage: 18,
              imageUrl: "https://images.unsplash.com/photo-1550572017-edd951aa8ca5?w=400"
            }
          ]
        },
        // Electrolytes
        {
          categoryName: "Electrolytes",
          products: [
            {
              name: "POTS Electrolyte Powder",
              description: "Sodium-rich electrolyte blend specifically designed for POTS and dysautonomia. No artificial sweeteners.",
              price: "28.99",
              originalPrice: "34.99",
              discountPercentage: 17,
              imageUrl: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400"
            },
            {
              name: "Sea Salt Hydration Tablets",
              description: "Natural sea salt tablets for quick sodium replacement. Dissolves easily and tastes great.",
              price: "16.99",
              originalPrice: null,
              discountPercentage: null,
              imageUrl: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400"
            }
          ]
        },
        // Tools & Aids
        {
          categoryName: "Tools & Aids",
          products: [
            {
              name: "Ergonomic Kitchen Utensils Set",
              description: "Lightweight, easy-grip kitchen tools designed for people with joint pain and limited hand strength.",
              price: "45.99",
              originalPrice: "59.99",
              discountPercentage: 23,
              imageUrl: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400"
            },
            {
              name: "Memory Foam Seat Cushion",
              description: "Orthopedic coccyx cushion for tailbone pain relief. Perfect for long sitting periods.",
              price: "32.99",
              originalPrice: null,
              discountPercentage: null,
              imageUrl: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400"
            }
          ]
        },
        // Courses
        {
          categoryName: "Courses",
          products: [
            {
              name: "EDS Self-Advocacy Masterclass",
              description: "Learn how to effectively communicate with doctors and advocate for your health needs. Includes printable resources.",
              price: "79.99",
              originalPrice: "99.99",
              discountPercentage: 20,
              imageUrl: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=400"
            },
            {
              name: "POTS Management Guide",
              description: "Comprehensive course on managing POTS symptoms, including exercise protocols and lifestyle modifications.",
              price: "59.99",
              originalPrice: null,
              discountPercentage: null,
              imageUrl: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400"
            }
          ]
        }
      ];

      // Create products for each category
      for (const categoryData of productData) {
        const category = createdCategories.find(c => c.name === categoryData.categoryName);
        if (category) {
          for (const productInfo of categoryData.products) {
            try {
              await storage.createProduct({
                categoryId: category.id,
                name: productInfo.name,
                description: productInfo.description,
                price: productInfo.price,
                originalPrice: productInfo.originalPrice,
                discountPercentage: productInfo.discountPercentage,
                imageUrl: productInfo.imageUrl,
                isActive: true,
              });
            } catch (error) {
              // Product might already exist, skip silently
            }
          }
        }
      }

      res.json({ message: "Default data initialized with products" });
    } catch (error) {
      console.error("Error initializing data:", error);
      res.status(500).json({ message: "Failed to initialize data" });
    }
  });

  // Cleanup endpoint to reset marketplace data (development only)
  app.post('/api/cleanup-marketplace', async (req, res) => {
    try {
      // Delete all products and categories to start fresh
      await db.delete(products);
      await db.delete(productCategories);
      res.json({ message: "Marketplace data cleaned up" });
    } catch (error) {
      console.error("Error cleaning up marketplace:", error);
      res.status(500).json({ message: "Failed to cleanup marketplace" });
    }
  });

  // Helper function to validate Stripe configuration
  function isValidStripeConfig(): boolean {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const priceId = process.env.STRIPE_PLUS_PRICE_ID;
    
    return !!(secretKey && 
             priceId &&
             secretKey.startsWith('sk_') && 
             priceId.startsWith('price_') &&
             secretKey.length > 10);
  }

  // Check if Stripe is properly configured
  let stripe: Stripe | null = null;
  let PRICE_ID: string | null = null;
  
  console.log("Checking Stripe configuration...");
  
  if (isValidStripeConfig()) {
    try {
      console.log("Valid Stripe configuration detected, initializing...");
      stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { 
        apiVersion: "2024-09-30.acacia" // Use supported API version
      });
      PRICE_ID = process.env.STRIPE_PLUS_PRICE_ID!;
      console.log("Stripe initialized successfully");
    } catch (error) {
      console.log("Stripe initialization failed, falling back to test mode:", (error as Error).message);
      stripe = null;
      PRICE_ID = null;
    }
  } else {
    console.log("Invalid or missing Stripe configuration, running in test mode");
  }

  // Billing routes
  app.post('/api/create-checkout-session', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      
      if (!user[0]) {
        return res.status(401).json({ error: "User not found" });
      }

      // Check if we're in test mode (no valid Stripe configuration)
      if (!stripe || !PRICE_ID) {
        console.log("Test mode: Simulating Stripe checkout session creation");
        // Simulate checkout session for testing
        return res.json({ 
          url: "https://checkout.stripe.com/test-session-url",
          test_mode: true,
          message: "Test mode: Real Stripe integration requires valid API keys" 
        });
      }

      console.log("Creating Stripe checkout session for user:", userId);

      let customerId = user[0].stripeCustomerId;
      
      // Create Stripe customer if doesn't exist
      if (!customerId) {
        const customer = await stripe.customers.create({ 
          email: user[0].email || undefined,
          metadata: { userId: userId }
        });
        customerId = customer.id;
        
        // Update user with Stripe customer ID
        await db.update(users)
          .set({ stripeCustomerId: customerId })
          .where(eq(users.id, userId));
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: PRICE_ID, quantity: 1 }],
        success_url: `${req.protocol}://${req.get('host')}/settings?purchase=success`,
        cancel_url: `${req.protocol}://${req.get('host')}/settings?purchase=cancel`,
        allow_promotion_codes: true,
        metadata: { userId: userId }
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      
      // Handle Stripe authentication errors gracefully
      if ((error as any).type === 'StripeAuthenticationError' || 
          (error as Error).message.includes('Invalid API Key')) {
        console.log("Stripe authentication failed, returning test mode response");
        return res.json({ 
          url: "https://checkout.stripe.com/test-session-url",
          test_mode: true,
          message: "Test mode: Stripe authentication failed" 
        });
      }
      
      // Don't expose internal errors to client
      res.status(500).json({ error: "Unable to create checkout session. Please try again later." });
    }
  });

  // Stripe webhook endpoint
  app.post('/api/stripe/webhook', 
    express.raw({ type: 'application/json' }), 
    async (req, res) => {
      // Skip webhook processing in test mode
      if (!stripe) {
        console.log("Test mode: Ignoring webhook");
        return res.json({ received: true });
      }

      const sig = req.headers['stripe-signature'] as string;
      let event: Stripe.Event;

      try {
        event = stripe.webhooks.constructEvent(
          req.body, 
          sig, 
          process.env.STRIPE_WEBHOOK_SECRET!
        );
      } catch (err) {
        console.error('Webhook signature verification failed:', err);
        return res.status(400).send(`Webhook error: ${(err as Error).message}`);
      }

      try {
        switch (event.type) {
          case 'checkout.session.completed': {
            const session = event.data.object as Stripe.Checkout.Session;
            const customerId = session.customer as string;
            const metadata = session.metadata;
            
            // Handle subscription purchases
            if (session.subscription) {
              const subscriptionId = session.subscription as string;
              const subscription = await stripe.subscriptions.retrieve(subscriptionId);
              
              // Find user by Stripe customer ID
              const user = await db.select().from(users)
                .where(eq(users.stripeCustomerId, customerId))
                .limit(1);
              
              if (user[0]) {
                await db.update(users)
                  .set({
                    plan: "plus",
                    planStatus: subscription.status === "active" ? "active" : "inactive",
                    currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
                  })
                  .where(eq(users.id, user[0].id));

                // Structured security logging without PII
                log(JSON.stringify({
                  userId: user[0].id,
                  subStatus: subscription.status,
                  periodEnd: subscription.current_period_end,
                  event: "billing:subscription_created"
                }), "billing");
              }
            }
            
            // Handle product purchases
            else if (metadata?.type === 'product_purchase' && metadata?.orderId) {
              const orderId = metadata.orderId;
              const userId = metadata.userId;
              
              console.log(`Processing product purchase for order ${orderId}, user ${userId}`);
              
              // Update order status to completed
              await storage.updateOrderStatus(orderId, 'completed');
              
              // Update order with payment intent ID
              if (session.payment_intent) {
                await db.update(orders)
                  .set({ stripePaymentIntentId: session.payment_intent as string })
                  .where(eq(orders.id, orderId));
              }
              
              // Clear user's cart after successful purchase
              if (userId) {
                await storage.clearCart(userId);
                console.log(`Cleared cart for user ${userId} after successful purchase`);
              }
            }
            
            break;
          }
          
          case 'customer.subscription.updated':
          case 'customer.subscription.deleted': {
            const subscription = event.data.object as Stripe.Subscription;
            const customerId = subscription.customer as string;
            
            // Find user by Stripe customer ID
            const user = await db.select().from(users)
              .where(eq(users.stripeCustomerId, customerId))
              .limit(1);
            
            if (user[0]) {
              await db.update(users)
                .set({
                  plan: subscription.status === "active" ? "plus" : "free",
                  planStatus: subscription.status,
                  currentPeriodEnd: subscription.status === "active" 
                    ? new Date((subscription as any).current_period_end * 1000)
                    : null,
                })
                .where(eq(users.id, user[0].id));

              // Structured security logging without PII
              log(JSON.stringify({
                userId: user[0].id,
                subStatus: subscription.status,
                periodEnd: subscription.current_period_end,
                event: "billing:subscription_updated"
              }), "billing");
            }
            break;
          }
        }
        
        res.json({ received: true });
      } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
      }
    }
  );

  // Get user billing status
  app.get('/api/billing/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await db.select({
        plan: users.plan,
        planStatus: users.planStatus,
        currentPeriodEnd: users.currentPeriodEnd
      }).from(users).where(eq(users.id, userId)).limit(1);
      
      if (!user[0]) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json(user[0]);
    } catch (error) {
      console.error("Error fetching billing status:", error);
      res.status(500).json({ error: "Failed to fetch billing status" });
    }
  });

  // Helper function to validate date range queries
  const rangeQuerySchema = z.object({
    from: z.string().datetime({ offset: false }).optional(),
    to: z.string().datetime({ offset: false }).optional()
  });

  function parseRange(query: any) {
    const { from, to } = rangeQuerySchema.parse(query);
    return { from, to };
  }

  function generateFilename(prefix: string, ext: string) {
    const stamp = new Date().toISOString().slice(0, 10);
    return `${prefix}_${stamp}.${ext}`;
  }

  // CSV Export endpoints
  const entitySchema = z.enum(["symptoms", "ai-interactions", "profile", "vitals", "sleep"]);

  app.get('/api/export/csv/:entity', isAuthenticated, async (req: any, res) => {
    try {
      const entity = entitySchema.parse(req.params.entity);
      const userId = req.user.claims.sub;
      const rangeConditions = parseRange(req.query);

      let rows: any[] = [];
      
      // Use validated range from parseRange and check for valid dates
      const { from, to } = rangeConditions;
      let fromDate: Date | undefined;
      let toDate: Date | undefined;
      
      if (from) {
        fromDate = new Date(from);
        if (isNaN(fromDate.getTime())) {
          return res.status(400).json({ message: "Invalid 'from' date format" });
        }
      }
      
      if (to) {
        toDate = new Date(to);
        if (isNaN(toDate.getTime())) {
          return res.status(400).json({ message: "Invalid 'to' date format" });
        }
      }

      switch (entity) {
        case "symptoms":
          rows = await storage.exportUserSymptomLogs(userId, fromDate, toDate);
          break;
          
        case "ai-interactions":
          rows = await storage.exportUserAIInteractions(userId, fromDate, toDate);
          break;
          
        case "profile":
          const user = await storage.getUser(userId);
          rows = user ? [user] : [];
          break;
          
        case "vitals":
          rows = await storage.exportUserVitalsLogs(userId, fromDate, toDate);
          break;
          
        case "sleep":
          rows = await storage.exportUserSleepLogs(userId, fromDate, toDate);
          break;
      }

      // Normalize data for CSV export
      const normalized = rows.map((row) => {
        const obj: any = { ...row };
        Object.keys(obj).forEach(key => {
          const value = obj[key];
          if (value instanceof Date) {
            obj[key] = value.toISOString();
          } else if (Array.isArray(value)) {
            obj[key] = value.join("; ");
          } else if (typeof value === "object" && value !== null) {
            obj[key] = JSON.stringify(value);
          }
        });
        return obj;
      });

      // Handle empty data by providing default fields
      let parserOptions: any = {};
      if (normalized.length === 0) {
        // Define default fields for each entity type when no data exists
        const defaultFields: Record<string, string[]> = {
          "symptoms": ["id", "userId", "symptoms", "intensity", "notes", "timestamp", "aiReflection", "aiProcessed", "createdAt"],
          "ai-interactions": ["id", "userId", "symptomLogId", "prompt", "response", "sentiment", "createdAt"],
          "profile": ["id", "email", "firstName", "lastName", "plan", "planStatus", "createdAt"],
          "vitals": ["id", "userId", "type", "value", "systolic", "diastolic", "unit", "source", "timestamp", "notes", "createdAt"],
          "sleep": ["id", "userId", "bedtime", "wakeTime", "totalMinutes", "deepMinutes", "remMinutes", "lightMinutes", "awakeMinutes", "quality", "source", "notes", "createdAt"]
        };
        parserOptions.fields = defaultFields[entity] || [];
      }

      const parser = new Parser(parserOptions);
      const csv = parser.parse(normalized);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${generateFilename(`zebby_${entity}`, "csv")}"`);
      res.setHeader("Cache-Control", "no-store");
      res.send(csv);
    } catch (error) {
      console.error("Error exporting CSV:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid entity type", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to export data" });
    }
  });

  // PDF Export endpoint
  const pdfSectionsSchema = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    sections: z.array(z.enum([
      "summary", "symptoms", "ai-interactions", "profile"
    ])).nonempty(),
    version: z.enum(["1", "2"]).optional().default("1") // Support v2 format
  });

  app.post('/api/export/pdf', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { from, to, sections, version } = pdfSectionsSchema.parse(req.body || {});
      const fromDate = from ? new Date(from) : undefined;
      const toDate = to ? new Date(to) : undefined;

      // Check if user has Plus plan for PDF exports (read from database where Stripe updates are stored)
      const userPlanQuery = await db.select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      
      const userPlan = userPlanQuery[0];
      if (!userPlan || (userPlan.plan !== "plus" || userPlan.planStatus !== "active")) {
        return res.status(402).json({ 
          error: "plus_required",
          message: "PDF exports are available with Zebby Plus subscription only. Upgrade to Plus to access this feature."
        });
      }

      // Fetch data based on requested sections and version
      const [user, symptoms, aiInteractions, vitalsLogs, sleepLogs] = await Promise.all([
        sections.includes("profile") || sections.includes("summary") 
          ? storage.getUser(userId) 
          : Promise.resolve(null),
        sections.includes("symptoms") || sections.includes("summary")
          ? storage.exportUserSymptomLogs(userId, fromDate, toDate)
          : Promise.resolve([]),
        sections.includes("ai-interactions") || sections.includes("summary")
          ? storage.exportUserAIInteractions(userId, fromDate, toDate)
          : Promise.resolve([]),
        // For v2: fetch vitals for HR trends (heart rate data)
        version === "2" ? storage.getUserVitalsLogs(userId, 'heart_rate', 1000, fromDate, toDate) : Promise.resolve([]),
        // For v2: fetch sleep logs for sleep trends
        version === "2" ? storage.getUserSleepLogs(userId, 100, fromDate, toDate) : Promise.resolve([])
      ]);

      // Create PDF document with built-in fonts that support bold styles
      const printer = new PdfPrinter({
        Helvetica: {
          normal: 'Helvetica',
          bold: 'Helvetica-Bold',
          italics: 'Helvetica-Oblique',
          bolditalics: 'Helvetica-BoldOblique'
        }
      } as any);

      const formatDate = (date?: Date | string) => 
        date ? new Date(date).toLocaleDateString() : "—";
      
      const formatTime = (date?: Date | string) => 
        date ? new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—";

      // Generate simple sparkline data as text representation for v2
      const generateSparklineData = (data: number[]) => {
        if (data.length === 0) return "No data";
        const max = Math.max(...data);
        const min = Math.min(...data);
        const range = max - min;
        if (range === 0) return "●●●●●"; // Flat line
        
        return data.slice(0, 10).map(val => {
          const normalized = (val - min) / range;
          if (normalized < 0.2) return "▁";
          if (normalized < 0.4) return "▂";
          if (normalized < 0.6) return "▄";
          if (normalized < 0.8) return "▆";
          return "█";
        }).join("");
      };

      // Generate highlight bullets based on data patterns
      const generateHighlights = (symptoms: SymptomLog[], aiInteractions: AIInteraction[]) => {
        const highlights: string[] = [];
        
        if (symptoms.length > 0) {
          // Most common symptoms
          const symptomCounts: Record<string, number> = {};
          symptoms.forEach(log => {
            log.symptoms.forEach(symptom => {
              symptomCounts[symptom] = (symptomCounts[symptom] || 0) + 1;
            });
          });
          const topSymptom = Object.entries(symptomCounts).sort(([,a], [,b]) => b - a)[0];
          if (topSymptom) {
            highlights.push(`Most frequent symptom: ${topSymptom[0]} (${topSymptom[1]} occurrences)`);
          }

          // Average intensity
          const avgIntensity = symptoms.reduce((sum, log) => sum + log.intensity, 0) / symptoms.length;
          highlights.push(`Average symptom intensity: ${avgIntensity.toFixed(1)}/10`);

          // Recent activity
          const recentLogs = symptoms.filter(log => 
            new Date(log.timestamp) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          );
          highlights.push(`Symptom logs in past 7 days: ${recentLogs.length}`);
        }

        if (aiInteractions.length > 0) {
          highlights.push(`AI support interactions: ${aiInteractions.length} conversations`);
        }

        // Date range summary
        const dateRange = from && to 
          ? `${formatDate(fromDate)} to ${formatDate(toDate)}`
          : `Complete health history`;
        highlights.push(`Report covers: ${dateRange}`);

        return highlights.slice(0, 5); // Limit to 5 bullets
      };

      const highlights = generateHighlights(symptoms, aiInteractions);

      // Choose content based on version
      console.log(`PDF Export: version="${version}", type=${typeof version}, choosing ${version === "2" ? "v2" : "v1"} content`);
      const content: any[] = version === "2" ? generateClinicianPackV2Content() : generateStandardContent();

      function generateClinicianPackV2Content() {
        return [
          // Enhanced Cover Page for Clinician Pack v2
          { 
            stack: [
              { text: "🦓", fontSize: 48, alignment: "center", margin: [0, 40, 0, 15] },
              { text: "ZEBBY'S WORLD", style: "logoV2", alignment: "center" },
              { text: "Clinician Pack Report v2", style: "clinicianTitle", alignment: "center", margin: [0, 5, 0, 30] },
              { 
                text: user?.firstName && user?.lastName 
                  ? `Patient: ${user.firstName} ${user.lastName}` 
                  : "Patient: [Name not provided]", 
                style: "patientInfo", 
                alignment: "center" 
              },
              { 
                text: `Date Range: ${from ? formatDate(fromDate) : "All data"} - ${to ? formatDate(toDate) : "Present"}`,
                style: "dateRange", 
                alignment: "center", 
                margin: [0, 5, 0, 5] 
              },
              { 
                text: `Generated: ${new Date().toLocaleString()}`,
                style: "timestamp", 
                alignment: "center", 
                margin: [0, 0, 0, 40] 
              },
              { 
                text: "INFORMATIONAL ONLY — NOT MEDICAL ADVICE", 
                style: "medicalDisclaimer", 
                alignment: "center",
                margin: [0, 20, 0, 60]
              },
              { 
                text: "This report contains patient-reported health tracking data compiled for clinical review. All symptom entries, vitals, and AI interactions are self-reported by the patient. This information should be considered alongside clinical assessment and is not a substitute for professional medical evaluation.", 
                style: "coverDisclaimer", 
                alignment: "center",
                margin: [40, 0, 40, 0]
              }
            ],
            pageBreak: "after"
          },

          // AI Analysis Summary Block
          (() => {
            const latestAiReflection = aiInteractions
              .filter(ai => ai.response && ai.response.length > 20)
              .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
            
            return {
              stack: [
                { text: "AI Analysis Summary", style: "h1" },
                { text: "Zebby's Gentle Reflection", style: "h2", margin: [0, 0, 0, 8] },
                {
                  text: latestAiReflection 
                    ? latestAiReflection.response.slice(0, 120) + (latestAiReflection.response.length > 120 ? "..." : "")
                    : "No recent AI analysis available for this time period.",
                  style: "aiAnalysis",
                  margin: [10, 5, 10, 15],
                  italics: true
                },
                { 
                  text: latestAiReflection 
                    ? `Based on interaction from ${formatDate(latestAiReflection.createdAt)}` 
                    : "",
                  style: "aiTimestamp",
                  fontSize: 8,
                  color: '#6b7280',
                  margin: [10, 0, 0, 20]
                }
              ]
            };
          })(),

          // Trends Overview with Sparklines
          {
            stack: [
              { text: "Health Trends Overview", style: "h1" },
              { text: "Visual patterns for clinical assessment", style: "subtitle", margin: [0, 0, 0, 15] },
              {
                columns: [
                  {
                    width: '33%',
                    stack: [
                      { text: "Pain Levels", style: "trendTitle" },
                      { 
                        text: (() => {
                          const painData = symptoms
                            .filter(s => s.intensity && s.intensity > 0)
                            .slice(-14) // Last 14 entries
                            .map(s => s.intensity || 0);
                          return generateSparklineData(painData);
                        })(),
                        style: "sparkline"
                      },
                      { 
                        text: symptoms.length > 0 
                          ? `Avg: ${(symptoms.reduce((sum, s) => sum + (s.intensity || 0), 0) / symptoms.length).toFixed(1)}/10`
                          : "No data",
                        style: "trendStat"
                      }
                    ]
                  },
                  {
                    width: '33%',
                    stack: [
                      { text: "Heart Rate", style: "trendTitle" },
                      { 
                        text: (() => {
                          const hrData = vitalsLogs
                            .slice(-14) // Last 14 entries
                            .map(v => parseFloat(v.value) || 0);
                          return generateSparklineData(hrData);
                        })(),
                        style: "sparkline"
                      },
                      { 
                        text: vitalsLogs.length > 0 
                          ? `Avg: ${Math.round(vitalsLogs.reduce((sum, v) => sum + (parseFloat(v.value) || 0), 0) / vitalsLogs.length)} bpm`
                          : "No data",
                        style: "trendStat"
                      }
                    ]
                  },
                  {
                    width: '33%',
                    stack: [
                      { text: "Sleep Hours", style: "trendTitle" },
                      { 
                        text: (() => {
                          const sleepData = sleepLogs
                            .slice(-14) // Last 14 entries
                            .map(s => s.totalMinutes ? s.totalMinutes / 60 : 0);
                          return generateSparklineData(sleepData);
                        })(),
                        style: "sparkline"
                      },
                      { 
                        text: sleepLogs.length > 0 
                          ? `Avg: ${(sleepLogs.reduce((sum, s) => sum + (s.totalMinutes || 0), 0) / sleepLogs.length / 60).toFixed(1)}h`
                          : "No data",
                        style: "trendStat"
                      }
                    ]
                  }
                ],
                margin: [0, 0, 0, 25]
              }
            ]
          }
          ,

          // Enhanced Symptom Logs Table for v2 with time, weather, HR, water stamps
          ...(sections.includes("symptoms") && symptoms.length ? [{
            text: "Detailed Symptom Logs", style: "h1", pageBreak: "before"
          }, {
            text: `${symptoms.length} entries with contextual data`, style: "subtitle", margin: [0, 0, 0, 10]
          }, {
            table: {
              headerRows: 1,
              widths: ["12%", "8%", "25%", "10%", "20%", "25%"],
              body: [
                [
                  {text:"Date", style:"tableHeader"}, 
                  {text:"Time", style:"tableHeader"}, 
                  {text:"Symptoms", style:"tableHeader"}, 
                  {text:"Intensity", style:"tableHeader"}, 
                  {text:"Context", style:"tableHeader"},
                  {text:"Notes & AI Insight", style:"tableHeader"}
                ],
                ...symptoms.map((symptom: SymptomLog) => [
                  { text: formatDate(symptom.timestamp), fontSize: 9 },
                  { text: formatTime(symptom.timestamp), fontSize: 9 },
                  { text: symptom.symptoms?.join(", ") || "No symptoms listed", fontSize: 9 },
                  { text: symptom.intensity ? `${symptom.intensity}/10` : "—", fontSize: 9, alignment: "center" },
                  { 
                    text: [
                      symptom.weatherTemp ? `🌡️ ${symptom.weatherTemp}°C` : "",
                      symptom.weatherCondition ? ` ${symptom.weatherCondition}` : "",
                      symptom.heartRateBpm ? `\n❤️ ${symptom.heartRateBpm} bpm` : "",
                      symptom.waterIntakeCurrentMl ? `\n💧 ${symptom.waterIntakeCurrentMl}ml` : ""
                    ].filter(Boolean).join(""),
                    fontSize: 8,
                    color: '#6b7280'
                  },
                  { 
                    text: [
                      { text: (symptom.notes || "No notes").slice(0, 100), fontSize: 9 },
                      symptom.aiReflection ? { text: `\n\nAI: ${symptom.aiReflection.slice(0, 80)}...`, fontSize: 8, color: '#059669', italics: true } : ""
                    ].filter(Boolean)
                  }
                ])
              ]
            },
            layout: {
              fillColor: (rowIndex: number) => rowIndex === 0 ? '#f9fafb' : rowIndex % 2 === 0 ? '#f9fafb' : null,
              hLineWidth: () => 0.5,
              vLineWidth: () => 0.5,
              hLineColor: () => '#e5e7eb',
              vLineColor: () => '#e5e7eb'
            },
            margin: [0,0,0,15]
          }] : [])
        ];
      }

      function generateStandardContent() {
        return [
          // Cover Page
          { 
            stack: [
              { text: "🦓", fontSize: 48, alignment: "center", margin: [0, 60, 0, 20] },
              { text: "ZEBBY", style: "logo", alignment: "center" },
              { text: "Health Tracking Report", style: "subtitle", alignment: "center", margin: [0, 5, 0, 40] },
              { text: `Patient: ${user?.firstName} ${user?.lastName}`, style: "patientInfo", alignment: "center" },
              { text: `Report Date: ${new Date().toLocaleDateString()}`, style: "patientInfo", alignment: "center", margin: [0, 5, 0, 40] },
              { text: "CLINICIAN PACK", style: "clinicianPack", alignment: "center", margin: [0, 20, 0, 60] },
              { 
                text: "This report contains comprehensive health tracking data for clinical review. All information is patient-reported and should be considered alongside clinical assessment.", 
                style: "coverDisclaimer",
                alignment: "center",
                margin: [40, 0, 40, 0]
              }
            ],
            pageBreak: "after"
          },

          // Key Highlights Section for v1
          { text: "Key Highlights", style: "h1" },
          { text: "Recent patterns and notable information for clinical consideration:", style: "subtitle", margin: [0, 0, 0, 10] },
          {
            ul: highlights,
            margin: [0, 0, 0, 20],
            style: "highlights"
          }
        ];
      }

      // Add enhanced content sections common to both versions
      const commonSections: any[] = [];

      if (sections.includes("summary")) {
        commonSections.push({ text: "Summary", style: "h2" });
        commonSections.push({
          ul: [
            `User: ${user?.firstName} ${user?.lastName} (${user?.email})`,
            `Symptoms logged: ${symptoms.length}`,
            `AI interactions: ${aiInteractions.length}`,
            `Plan: ${user?.plan || "Free"}`
          ],
          margin: [0,0,0,12]
        });
      }

      if (sections.includes("profile") && user) {
        commonSections.push({ text: "Profile", style: "h2" });
        commonSections.push({
          ul: [
            `Name: ${user.firstName} ${user.lastName}`,
            `Email: ${user.email}`,
            `Plan: ${user.plan} (${user.planStatus})`,
            `Member since: ${formatDate(user.createdAt || undefined)}`
          ],
          margin: [0,0,0,12]
        });
      }

      if (sections.includes("ai-interactions") && aiInteractions.length && version === "1") {
        commonSections.push({ text: "AI Support Conversations", style: "h2" });
        commonSections.push({ text: `Total conversations: ${aiInteractions.length}`, style: "subtitle", margin: [0, 0, 0, 8] });
        commonSections.push({
          table: {
            headerRows: 1,
            widths: ["15%", "40%", "45%"],
            body: [
              [
                {text:"Date", style:"tableHeader"}, 
                {text:"Patient Input", style:"tableHeader"}, 
                {text:"AI Response Summary", style:"tableHeader"}
              ],
              ...aiInteractions.map((interaction: AIInteraction) => [
                { text: formatDate(interaction.createdAt || undefined), fontSize: 9 },
                { text: (interaction.prompt || "No input recorded").slice(0, 120), fontSize: 9 },
                { text: (interaction.response || "No response recorded").slice(0, 180) + (interaction.response && interaction.response.length > 180 ? "..." : ""), fontSize: 9 }
              ])
            ]
          },
          layout: {
            fillColor: (rowIndex: number) => rowIndex === 0 ? '#f9fafb' : rowIndex % 2 === 0 ? '#f9fafb' : null,
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#e5e7eb',
            vLineColor: () => '#e5e7eb'
          },
          margin: [0,0,0,15]
        });
      }

      // Append common sections to content
      content.push(...commonSections);

      const docDef: any = {
        pageMargins: [50, 50, 50, 70],
        content,
        defaultStyle: { font: 'Helvetica', fontSize: 10, lineHeight: 1.3 },
        styles: {
          logo: { fontSize: 32, bold: true, color: '#2563eb', letterSpacing: 3 },
          logoV2: { fontSize: 28, bold: true, color: '#059669', letterSpacing: 4 },
          subtitle: { fontSize: 14, color: '#666', margin: [0, 0, 0, 10] },
          patientInfo: { fontSize: 12, bold: true, color: '#374151' },
          dateRange: { fontSize: 11, color: '#6b7280' },
          timestamp: { fontSize: 10, color: '#6b7280' },
          clinicianPack: { fontSize: 16, bold: true, color: '#059669', letterSpacing: 2 },
          clinicianTitle: { fontSize: 18, bold: true, color: '#059669', letterSpacing: 1 },
          medicalDisclaimer: { fontSize: 14, bold: true, color: '#dc2626', letterSpacing: 1 },
          coverDisclaimer: { fontSize: 9, color: '#6b7280', lineHeight: 1.4, italics: true },
          h1: { fontSize: 18, bold: true, margin: [0, 0, 0, 8], color: '#1f2937' },
          h2: { fontSize: 14, bold: true, margin: [0, 16, 0, 8], color: '#374151' },
          highlights: { fontSize: 11, lineHeight: 1.4, margin: [0, 4, 0, 4] },
          aiAnalysis: { fontSize: 11, color: '#059669', lineHeight: 1.4 },
          aiTimestamp: { fontSize: 8, color: '#6b7280' },
          trendTitle: { fontSize: 10, bold: true, color: '#374151', margin: [0, 0, 0, 4] },
          sparkline: { fontSize: 14, color: '#2563eb', alignment: 'center', margin: [0, 2, 0, 2] },
          trendStat: { fontSize: 9, color: '#6b7280', alignment: 'center' },
          disclaimer: { italics: true, color: "#6b7280", fontSize: 9 },
          tableHeader: { bold: true, fillColor: '#f3f4f6', color: '#374151' },
          print: { fontSize: 9, color: '#000' }
        },
        header: (currentPage: number) => currentPage > 1 ? {
          text: version === "2" 
            ? `${user?.firstName} ${user?.lastName} • Zebby's World Clinician Pack v2`
            : `${user?.firstName} ${user?.lastName} • Zebby Health Report`,
          alignment: 'center',
          fontSize: 8,
          color: '#6b7280',
          margin: [0, 20, 0, 0]
        } : null,
        footer: (currentPage: number, pageCount: number) => ({
          columns: [
            { 
              text: version === "2" 
                ? 'Zebby • Not medical advice • Generated for clinical review'
                : 'Generated by Zebby Health Tracker', 
              fontSize: 7, 
              color: '#9ca3af' 
            },
            { text: `${currentPage}/${pageCount}`, fontSize: 7, color: '#9ca3af', alignment: 'right' }
          ],
          margin: [50, 15, 50, 0]
        })
      };

      const pdfDoc = printer.createPdfKitDocument(docDef);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${generateFilename(version === "2" ? "zebby_clinician_pack_v2" : "zebby_report", "pdf")}"`);
      res.setHeader("Cache-Control", "no-store");
      pdfDoc.pipe(res);
      pdfDoc.end();
    } catch (error) {
      console.error("Error exporting PDF:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to export PDF" });
    }
  });

  // Sharing API Routes
  const shareValidationSchema = z.object({
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    contentType: z.enum(["symptom_trends", "health_summary", "ai_insights", "product_review", "achievement", "custom"]),
    dateRangeStart: z.string().datetime().optional(),
    dateRangeEnd: z.string().datetime().optional(),
    dataSelections: z.record(z.any()),
    contentSnapshot: z.record(z.any()),
    shareType: z.enum(["public", "password_protected", "private"]).default("public"),
    sharePassword: z.string().optional(),
    expiresAt: z.string().datetime().optional(),
    allowComments: z.boolean().default(false),
    showAuthorInfo: z.boolean().default(true),
  }).superRefine((data, ctx) => {
    // Require password for password-protected shares
    if (data.shareType === "password_protected" && (!data.sharePassword || data.sharePassword.trim() === "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Password is required for password-protected shares",
        path: ["sharePassword"]
      });
    }
  });

  // Create shared content
  app.post('/api/sharing/content', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = shareValidationSchema.parse(req.body);
      
      const sharedContent = await storage.createSharedContent({
        userId,
        ...validatedData,
        dateRangeStart: validatedData.dateRangeStart ? new Date(validatedData.dateRangeStart) : undefined,
        dateRangeEnd: validatedData.dateRangeEnd ? new Date(validatedData.dateRangeEnd) : undefined,
        expiresAt: validatedData.expiresAt ? new Date(validatedData.expiresAt) : undefined,
      });

      res.json(sharedContent);
    } catch (error) {
      console.error("Error creating shared content:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create shared content" });
    }
  });

  // Get user's shared content
  app.get('/api/sharing/content', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sharedContent = await storage.getUserSharedContent(userId);
      res.json(sharedContent);
    } catch (error) {
      console.error("Error fetching user shared content:", error);
      res.status(500).json({ message: "Failed to fetch shared content" });
    }
  });

  // Get public shared content (no auth required, but password may be required)
  app.get('/api/sharing/public/:id', async (req, res) => {
    console.log(`[DEBUG] GET /api/sharing/public/${req.params.id} - Starting request`);
    try {
      const { id } = req.params;
      const { password } = req.query; // Accept password as query parameter
      console.log(`[DEBUG] Request params: id=${id}, password=${password ? '[PROVIDED]' : '[NONE]'}`);
      
      const viewerIpHash = req.ip ? crypto.createHash('sha256').update(req.ip).digest('hex') : undefined;
      console.log(`[DEBUG] Viewer IP hash: ${viewerIpHash ? '[GENERATED]' : '[NONE]'}`);
      
      console.log(`[DEBUG] Calling storage.getPublicSharedContent...`);
      const sharedContent = await storage.getPublicSharedContent(id, password as string, viewerIpHash);
      console.log(`[DEBUG] Storage returned: ${sharedContent ? 'CONTENT_FOUND' : 'NO_CONTENT'}`);
      
      if (!sharedContent) {
        console.log(`[DEBUG] Returning 404 - content not found`);
        return res.status(404).json({ 
          message: "Shared content not found, no longer available, or invalid password provided" 
        });
      }

      // Check expiration
      if (sharedContent.expiresAt && new Date() > sharedContent.expiresAt) {
        console.log(`[DEBUG] Returning 410 - content expired`);
        return res.status(410).json({ message: "This shared content has expired" });
      }

      console.log(`[DEBUG] Returning 200 - success`);
      res.json(sharedContent);
    } catch (error) {
      console.error("[ERROR] Error fetching public shared content:", error);
      console.error("[ERROR] Stack trace:", error.stack);
      res.status(500).json({ message: "Failed to fetch shared content" });
    }
  });

  // Alternative POST endpoint for password-protected content (more secure)
  app.post('/api/sharing/public/:id/access', async (req, res) => {
    try {
      const { id } = req.params;
      const { password } = req.body;
      const viewerIpHash = req.ip ? crypto.createHash('sha256').update(req.ip).digest('hex') : undefined;
      
      const sharedContent = await storage.getPublicSharedContent(id, password, viewerIpHash);
      
      if (!sharedContent) {
        return res.status(403).json({ 
          message: "Access denied. Invalid password or content not found." 
        });
      }

      // Check expiration
      if (sharedContent.expiresAt && new Date() > sharedContent.expiresAt) {
        return res.status(410).json({ message: "This shared content has expired" });
      }

      res.json(sharedContent);
    } catch (error) {
      console.error("Error accessing password-protected content:", error);
      res.status(500).json({ message: "Failed to access shared content" });
    }
  });

  // Update shared content
  app.put('/api/sharing/content/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      const validatedData = shareValidationSchema.partial().parse(req.body);
      
      const updatedContent = await storage.updateSharedContent(id, userId, {
        ...validatedData,
        dateRangeStart: validatedData.dateRangeStart ? new Date(validatedData.dateRangeStart) : undefined,
        dateRangeEnd: validatedData.dateRangeEnd ? new Date(validatedData.dateRangeEnd) : undefined,
        expiresAt: validatedData.expiresAt ? new Date(validatedData.expiresAt) : undefined,
      });

      res.json(updatedContent);
    } catch (error) {
      console.error("Error updating shared content:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update shared content" });
    }
  });

  // Delete shared content
  app.delete('/api/sharing/content/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      await storage.deleteSharedContent(id, userId);
      res.json({ message: "Shared content deleted successfully" });
    } catch (error) {
      console.error("Error deleting shared content:", error);
      res.status(500).json({ message: "Failed to delete shared content" });
    }
  });

  // Get sharing analytics
  app.get('/api/sharing/analytics/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      // Verify user owns this content
      const content = await storage.getSharedContent(id);
      if (!content || content.userId !== userId) {
        return res.status(404).json({ message: "Shared content not found" });
      }

      const analytics = await storage.getShareAnalytics(id);
      const summary = await storage.getShareAnalyticsSummary(id);
      
      res.json({ analytics, summary });
    } catch (error) {
      console.error("Error fetching share analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // Add comment to shared content
  app.post('/api/sharing/comments/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { commentText, authorName, authorEmail, isSupport, isQuestion } = req.body;
      
      if (!commentText || !authorName) {
        return res.status(400).json({ message: "Comment text and author name are required" });
      }

      // Verify shared content exists and allows comments
      const content = await storage.getSharedContent(id);
      if (!content || !content.allowComments) {
        return res.status(404).json({ message: "Comments not allowed on this content" });
      }

      const comment = await storage.createShareComment({
        sharedContentId: id,
        commentText,
        authorName,
        authorEmail,
        isSupport: isSupport || false,
        isQuestion: isQuestion || false,
      });

      res.json(comment);
    } catch (error) {
      console.error("Error creating comment:", error);
      res.status(500).json({ message: "Failed to create comment" });
    }
  });

  // Get comments for shared content
  app.get('/api/sharing/comments/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { approved } = req.query;
      
      const comments = await storage.getShareComments(id, approved === 'true' ? true : undefined);
      res.json(comments);
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
