import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { generateEmpathicReflection, generatePersonalizedInsight } from "./openai";
import { generateInsightCards, TIMEFRAMES } from "./analytics";
import { 
  insertSymptomLogSchema, 
  insertVitalsLogSchema,
  insertSleepLogSchema,
  products, 
  productCategories, 
  users, 
  type SymptomLog, 
  type AIInteraction,
  type VitalsLog,
  type SleepLog 
} from "@shared/schema";
import { db } from "./db";
import { z } from "zod";
import Stripe from "stripe";
import { eq, and, gte, lte } from "drizzle-orm";
import { Parser } from "json2csv";
// @ts-ignore
import PdfPrinter from "pdfmake";
import { parseString } from "xml2js";
import multer from "multer";
import yauzl from "yauzl";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

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

  // Enhanced symptom logging routes
  app.post('/api/symptoms', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { symptomEntries, location, ...sessionData } = req.body;

      if (!symptomEntries || symptomEntries.length === 0) {
        return res.status(400).json({ message: "At least one symptom entry is required" });
      }

      // Get weather data if location is provided
      let weatherData = null;
      if (location && location !== "Unknown") {
        const { getCurrentWeather, getWeatherByCity } = await import('./weatherService');
        
        if (location.includes(',')) {
          // Location is lat,lon coordinates
          const [lat, lon] = location.split(',').map(Number);
          if (!isNaN(lat) && !isNaN(lon)) {
            weatherData = await getCurrentWeather(lat, lon);
          }
        } else {
          // Location is city name
          weatherData = await getWeatherByCity(location);
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
        weatherTemp: weatherData?.temperature || null,
        weatherCondition: weatherData?.condition || null,
        weatherLocation: weatherData?.location || null,
        // Legacy fields for backward compatibility
        symptoms: symptomEntries.map((entry: any) => entry.name),
        intensity: Math.round(symptomEntries.reduce((sum: number, entry: any) => sum + entry.intensity, 0) / symptomEntries.length)
      };

      const symptomLog = await storage.createSymptomLog(symptomLogData);

      // Create individual symptom entries
      const createdEntries = [];
      for (const entry of symptomEntries) {
        const symptomEntry = await storage.createSymptomEntry({
          symptomLogId: symptomLog.id,
          symptomName: entry.name,
          intensity: entry.intensity,
          notes: entry.notes || null
        });
        createdEntries.push(symptomEntry);
      }

      // Generate AI reflection asynchronously
      const symptomSummary = symptomEntries.map((entry: any) => `${entry.name} (${entry.intensity}/10)`).join(", ");
      generateEmpathicReflection(
        symptomEntries.map((entry: any) => entry.name),
        Math.round(symptomEntries.reduce((sum: number, entry: any) => sum + entry.intensity, 0) / symptomEntries.length),
        sessionData.notes || undefined
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
      const { amountMl, timestamp, notes } = req.body;
      
      if (!amountMl || amountMl <= 0) {
        return res.status(400).json({ message: "Valid amount in ml is required" });
      }

      const waterLog = await storage.createWaterIntakeLog({
        userId,
        amountMl,
        timestamp: new Date(timestamp || Date.now()),
        source: 'manual',
        notes: notes || null
      });

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
      const { amountMg, foodItem, timestamp, notes } = req.body;
      
      if (!amountMg || amountMg <= 0) {
        return res.status(400).json({ message: "Valid amount in mg is required" });
      }

      const sodiumLog = await storage.createSodiumIntakeLog({
        userId,
        amountMg,
        foodItem: foodItem || null,
        timestamp: new Date(timestamp || Date.now()),
        source: 'manual',
        notes: notes || null
      });

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
    try {
      const userId = req.user.claims.sub;
      const validatedData = insertVitalsLogSchema.parse({
        ...req.body,
        userId,
      });

      const vitalsLog = await storage.createVitalsLog(validatedData);
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
    try {
      const userId = req.user.claims.sub;
      const validatedData = insertSleepLogSchema.parse({
        ...req.body,
        userId,
      });

      const sleepLog = await storage.createSleepLog(validatedData);
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
    ])).nonempty()
  });

  app.post('/api/export/pdf', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { from, to, sections } = pdfSectionsSchema.parse(req.body || {});
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

      // Fetch data based on requested sections
      const [user, symptoms, aiInteractions] = await Promise.all([
        sections.includes("profile") || sections.includes("summary") 
          ? storage.getUser(userId) 
          : Promise.resolve(null),
        sections.includes("symptoms") || sections.includes("summary")
          ? storage.exportUserSymptomLogs(userId, fromDate, toDate)
          : Promise.resolve([]),
        sections.includes("ai-interactions") || sections.includes("summary")
          ? storage.exportUserAIInteractions(userId, fromDate, toDate)
          : Promise.resolve([])
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

      const content: any[] = [
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

        // Key Highlights Section
        { text: "Key Highlights", style: "h1" },
        { text: "Recent patterns and notable information for clinical consideration:", style: "subtitle", margin: [0, 0, 0, 10] },
        {
          ul: highlights,
          margin: [0, 0, 0, 20],
          style: "highlights"
        },

        // Key Changes Since Last Visit
        { text: "Key Changes Since Last Visit", style: "h2" },
        { text: "Notable patterns and changes in the past 30 days (when applicable):", style: "subtitle", margin: [0, 0, 0, 10] },
        (() => {
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const recentSymptoms = symptoms.filter(log => new Date(log.timestamp) > thirtyDaysAgo);
          const olderSymptoms = symptoms.filter(log => new Date(log.timestamp) <= thirtyDaysAgo);
          
          const changes: string[] = [];
          
          if (recentSymptoms.length > 0) {
            const recentAvgIntensity = recentSymptoms.reduce((sum, log) => sum + log.intensity, 0) / recentSymptoms.length;
            const olderAvgIntensity = olderSymptoms.length > 0 
              ? olderSymptoms.reduce((sum, log) => sum + log.intensity, 0) / olderSymptoms.length 
              : null;
              
            if (olderAvgIntensity !== null) {
              const change = recentAvgIntensity - olderAvgIntensity;
              const direction = change > 0.5 ? "increased" : change < -0.5 ? "decreased" : "remained stable";
              changes.push(`Average symptom intensity has ${direction} (${recentAvgIntensity.toFixed(1)} vs ${olderAvgIntensity.toFixed(1)})`);
            } else {
              changes.push(`Started tracking symptoms with average intensity of ${recentAvgIntensity.toFixed(1)}/10`);
            }
            
            changes.push(`Recorded ${recentSymptoms.length} symptom logs in past 30 days`);
            
            // Most frequent recent symptoms
            const recentSymptomCounts: Record<string, number> = {};
            recentSymptoms.forEach(log => {
              log.symptoms.forEach(symptom => {
                recentSymptomCounts[symptom] = (recentSymptomCounts[symptom] || 0) + 1;
              });
            });
            const topRecentSymptom = Object.entries(recentSymptomCounts).sort(([,a], [,b]) => b - a)[0];
            if (topRecentSymptom) {
              changes.push(`Most frequent recent symptom: ${topRecentSymptom[0]} (${topRecentSymptom[1]} times)`);
            }
          } else {
            changes.push("No symptom logs recorded in the past 30 days");
          }
          
          if (changes.length === 0) {
            changes.push("Insufficient data to determine changes since last visit");
          }
          
          return {
            ul: changes,
            margin: [0, 0, 0, 20],
            style: "highlights"
          };
        })(),

        { text: "Data Range & Summary", style: "h2" },
        { text: `Range: ${from ? formatDate(fromDate) : "All available data"} – ${to ? formatDate(toDate) : "Present"}`, margin: [0,0,0,10] },
      ];

      if (sections.includes("summary")) {
        content.push({ text: "Summary", style: "h2" });
        content.push({
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
        content.push({ text: "Profile", style: "h2" });
        content.push({
          ul: [
            `Name: ${user.firstName} ${user.lastName}`,
            `Email: ${user.email}`,
            `Plan: ${user.plan} (${user.planStatus})`,
            `Member since: ${formatDate(user.createdAt || undefined)}`
          ],
          margin: [0,0,0,12]
        });
      }

      if (sections.includes("symptoms") && symptoms.length) {
        content.push({ text: "Symptom Logs", style: "h2" });
        content.push({ text: `Total entries: ${symptoms.length}`, style: "subtitle", margin: [0, 0, 0, 8] });
        content.push({
          table: {
            headerRows: 1,
            widths: ["15%", "35%", "12%", "38%"],
            body: [
              [
                {text:"Date", style:"tableHeader"}, 
                {text:"Symptoms", style:"tableHeader"}, 
                {text:"Intensity", style:"tableHeader"}, 
                {text:"Notes & AI Reflection", style:"tableHeader"}
              ],
              ...symptoms.map((symptom: SymptomLog) => [
                { text: formatDate(symptom.timestamp), fontSize: 9 },
                { text: symptom.symptoms.join(", "), fontSize: 9 },
                { text: `${symptom.intensity}/10`, fontSize: 9, alignment: "center" },
                { 
                  text: [
                    { text: (symptom.notes || "No notes").slice(0, 150), fontSize: 9 },
                    symptom.aiReflection ? { text: `\n\nAI Insight: ${symptom.aiReflection.slice(0, 100)}...`, fontSize: 8, color: '#059669', italics: true } : ""
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
        });
      }

      if (sections.includes("ai-interactions") && aiInteractions.length) {
        content.push({ text: "AI Support Conversations", style: "h2" });
        content.push({ text: `Total conversations: ${aiInteractions.length}`, style: "subtitle", margin: [0, 0, 0, 8] });
        content.push({
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

      const docDef: any = {
        pageMargins: [50, 50, 50, 70],
        content,
        defaultStyle: { font: 'Helvetica', fontSize: 10, lineHeight: 1.3 },
        styles: {
          logo: { fontSize: 32, bold: true, color: '#2563eb', letterSpacing: 3 },
          subtitle: { fontSize: 14, color: '#666', margin: [0, 0, 0, 10] },
          patientInfo: { fontSize: 12, bold: true, color: '#374151' },
          clinicianPack: { fontSize: 16, bold: true, color: '#059669', letterSpacing: 2 },
          coverDisclaimer: { fontSize: 9, color: '#6b7280', lineHeight: 1.4, italics: true },
          h1: { fontSize: 18, bold: true, margin: [0, 0, 0, 8], color: '#1f2937' },
          h2: { fontSize: 14, bold: true, margin: [0, 16, 0, 8], color: '#374151' },
          highlights: { fontSize: 11, lineHeight: 1.4, margin: [0, 4, 0, 4] },
          disclaimer: { italics: true, color: "#6b7280", fontSize: 9 },
          tableHeader: { bold: true, fillColor: '#f3f4f6', color: '#374151' },
          print: { fontSize: 9, color: '#000' } // Print-optimized styles
        },
        header: (currentPage: number) => currentPage > 1 ? {
          text: `${user?.firstName} ${user?.lastName} • Zebby Health Report`,
          alignment: 'center',
          fontSize: 8,
          color: '#6b7280',
          margin: [0, 20, 0, 0]
        } : null,
        footer: (currentPage: number, pageCount: number) => ({
          columns: [
            { text: 'Generated by Zebby Health Tracker', fontSize: 7, color: '#9ca3af' },
            { text: `${currentPage}/${pageCount}`, fontSize: 7, color: '#9ca3af', alignment: 'right' }
          ],
          margin: [50, 15, 50, 0]
        })
      };

      const pdfDoc = printer.createPdfKitDocument(docDef);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${generateFilename("zebby_report", "pdf")}"`);
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

  const httpServer = createServer(app);
  return httpServer;
}

// Helper functions for health data import
async function processAppleHealthData(userId: string, parsedData: any) {
  const results = {
    imported: 0,
    conflicts: 0,
    skipped: 0
  };

  // Process heart rate data
  for (const record of parsedData.heartRate || []) {
    try {
      const existingVitals = await storage.getUserVitalsLogs(userId, 'heart_rate', 1000);
      const conflictFound = existingVitals.find(v => 
        Math.abs(new Date(v.timestamp).getTime() - new Date(record.startDate).getTime()) < 300000 // 5 min window
      );

      if (conflictFound) {
        await storage.createImportConflict({
          userId,
          source: 'apple_health',
          dataType: 'vitals',
          existingDataId: conflictFound.id,
          importData: record,
          conflictReason: 'similar_time',
          status: 'pending'
        });
        results.conflicts++;
      } else {
        await storage.createVitalsLog({
          userId,
          type: 'heart_rate',
          value: record.value.toString(),
          unit: 'bpm',
          source: 'apple_health',
          sourceId: record.uuid,
          timestamp: new Date(record.startDate)
        });
        results.imported++;
      }
    } catch (error) {
      console.error('Error processing Apple Health heart rate record:', error);
      results.skipped++;
    }
  }

  // Process steps data
  for (const record of parsedData.steps || []) {
    try {
      const existingVitals = await storage.getUserVitalsLogs(userId, 'steps', 1000);
      const conflictFound = existingVitals.find(v => 
        Math.abs(new Date(v.timestamp).getTime() - new Date(record.startDate).getTime()) < 300000 // 5 min window
      );

      if (conflictFound) {
        await storage.createImportConflict({
          userId,
          source: 'apple_health',
          dataType: 'vitals',
          existingDataId: conflictFound.id,
          importData: record,
          conflictReason: 'similar_time',
          status: 'pending'
        });
        results.conflicts++;
      } else {
        await storage.createVitalsLog({
          userId,
          type: 'steps',
          value: record.value.toString(),
          unit: record.unit,
          source: 'apple_health',
          sourceId: record.uuid,
          timestamp: new Date(record.startDate)
        });
        results.imported++;
      }
    } catch (error) {
      console.error('Error processing Apple Health steps record:', error);
      results.skipped++;
    }
  }

  // Process sleep data
  for (const record of parsedData.sleep || []) {
    try {
      const existingSleep = await storage.getUserSleepLogs(userId, 1000);
      const conflictFound = existingSleep.find(s => 
        Math.abs(new Date(s.bedtime).getTime() - new Date(record.startDate).getTime()) < 3600000 // 1 hour window
      );

      if (conflictFound) {
        await storage.createImportConflict({
          userId,
          source: 'apple_health',
          dataType: 'sleep',
          existingDataId: conflictFound.id,
          importData: record,
          conflictReason: 'similar_time',
          status: 'pending'
        });
        results.conflicts++;
      } else {
        const duration = new Date(record.endDate).getTime() - new Date(record.startDate).getTime();
        await storage.createSleepLog({
          userId,
          bedtime: new Date(record.startDate),
          wakeTime: new Date(record.endDate),
          totalMinutes: Math.round(duration / 60000),
          source: 'apple_health',
          sourceId: record.uuid
        });
        results.imported++;
      }
    } catch (error) {
      console.error('Error processing Apple Health sleep record:', error);
      results.skipped++;
    }
  }

  return results;
}

async function syncGoogleFitData(userId: string, source: any) {
  const results = {
    imported: 0,
    conflicts: 0,
    skipped: 0
  };

  try {
    // Fetch heart rate data from Google Fit API
    const endTime = Date.now();
    const startTime = endTime - (7 * 24 * 60 * 60 * 1000); // Last 7 days

    const heartRateResponse = await fetch(
      `https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.heart_rate.bpm:com.google.android.gms:merge_heart_rate_bpm/datasets/${startTime * 1000000}-${endTime * 1000000}`,
      {
        headers: {
          'Authorization': `Bearer ${source.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (heartRateResponse.ok) {
      const heartRateData = await heartRateResponse.json();
      
      for (const point of heartRateData.point || []) {
        const timestamp = new Date(parseInt(point.startTimeNanos) / 1000000);
        const value = point.value[0]?.fpVal || point.value[0]?.intVal;
        
        if (!value) continue;

        // Check for conflicts
        const existingVitals = await storage.getUserVitalsLogs(userId, 'heart_rate', 1000);
        const conflictFound = existingVitals.find(v => 
          Math.abs(new Date(v.timestamp).getTime() - timestamp.getTime()) < 300000 // 5 min window
        );

        if (conflictFound) {
          await storage.createImportConflict({
            userId,
            source: 'google_fit',
            dataType: 'vitals',
            existingDataId: conflictFound.id,
            importData: { timestamp, value, unit: 'bpm' },
            conflictReason: 'similar_time',
            status: 'pending'
          });
          results.conflicts++;
        } else {
          await storage.createVitalsLog({
            userId,
            type: 'heart_rate',
            value: value.toString(),
            unit: 'bpm',
            source: 'google_fit',
            sourceId: `gfit_hr_${point.startTimeNanos}`,
            timestamp
          });
          results.imported++;
        }
      }
    }

    // Fetch steps data from Google Fit API
    const stepsResponse = await fetch(
      `https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.step_count.delta:com.google.android.gms:estimated_steps/datasets/${startTime * 1000000}-${endTime * 1000000}`,
      {
        headers: {
          'Authorization': `Bearer ${source.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (stepsResponse.ok) {
      const stepsData = await stepsResponse.json();
      
      for (const point of stepsData.point || []) {
        const timestamp = new Date(parseInt(point.startTimeNanos) / 1000000);
        const value = point.value[0]?.intVal;
        
        if (!value) continue;

        // Check for conflicts
        const existingVitals = await storage.getUserVitalsLogs(userId, 'steps', 1000);
        const conflictFound = existingVitals.find(v => 
          Math.abs(new Date(v.timestamp).getTime() - timestamp.getTime()) < 300000 // 5 min window
        );

        if (conflictFound) {
          await storage.createImportConflict({
            userId,
            source: 'google_fit',
            dataType: 'vitals',
            existingDataId: conflictFound.id,
            importData: { timestamp, value, unit: 'steps' },
            conflictReason: 'similar_time',
            status: 'pending'
          });
          results.conflicts++;
        } else {
          await storage.createVitalsLog({
            userId,
            type: 'steps',
            value: value.toString(),
            unit: 'steps',
            source: 'google_fit',
            sourceId: `gfit_steps_${point.startTimeNanos}`,
            timestamp
          });
          results.imported++;
        }
      }
    }

    // Fetch sleep data from Google Fit API
    const sleepResponse = await fetch(
      `https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.sleep.segment:com.google.android.gms:merged/datasets/${startTime * 1000000}-${endTime * 1000000}`,
      {
        headers: {
          'Authorization': `Bearer ${source.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (sleepResponse.ok) {
      const sleepData = await sleepResponse.json();
      
      // Group sleep points by session
      const sleepSessions = groupSleepSessions(sleepData.point || []);
      
      for (const session of sleepSessions) {
        // Check for conflicts
        const existingSleep = await storage.getUserSleepLogs(userId, 1000);
        const conflictFound = existingSleep.find(s => 
          Math.abs(new Date(s.bedtime).getTime() - session.bedtime.getTime()) < 3600000 // 1 hour window
        );

        if (conflictFound) {
          await storage.createImportConflict({
            userId,
            source: 'google_fit',
            dataType: 'sleep',
            existingDataId: conflictFound.id,
            importData: session,
            conflictReason: 'similar_time',
            status: 'pending'
          });
          results.conflicts++;
        } else {
          await storage.createSleepLog({
            userId,
            bedtime: session.bedtime,
            wakeTime: session.wakeTime,
            totalMinutes: session.totalMinutes,
            deepMinutes: session.deepMinutes,
            remMinutes: session.remMinutes,
            lightMinutes: session.lightMinutes,
            source: 'google_fit',
            sourceId: `gfit_sleep_${session.bedtime.getTime()}`
          });
          results.imported++;
        }
      }
    }

  } catch (error) {
    console.error('Error syncing Google Fit data:', error);
    // If token expired, we could refresh it here
    if (error.message?.includes('401')) {
      // Token refresh logic could go here
    }
  }

  return results;
}

function groupSleepSessions(sleepPoints: any[]) {
  const sessions: any[] = [];
  let currentSession: any = null;

  for (const point of sleepPoints) {
    const startTime = new Date(parseInt(point.startTimeNanos) / 1000000);
    const endTime = new Date(parseInt(point.endTimeNanos) / 1000000);
    const sleepType = point.value[0]?.intVal; // 1=awake, 2=sleep, 3=out-of-bed, 4=light sleep, 5=deep sleep, 6=REM sleep

    if (!currentSession || (startTime.getTime() - currentSession.wakeTime.getTime()) > 4 * 60 * 60 * 1000) {
      // New session if more than 4 hours gap
      if (currentSession) sessions.push(currentSession);
      currentSession = {
        bedtime: startTime,
        wakeTime: endTime,
        totalMinutes: 0,
        deepMinutes: 0,
        remMinutes: 0,
        lightMinutes: 0
      };
    }

    const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
    currentSession.wakeTime = endTime;
    currentSession.totalMinutes += duration;

    if (sleepType === 5) currentSession.deepMinutes += duration;
    else if (sleepType === 6) currentSession.remMinutes += duration;
    else if (sleepType === 4) currentSession.lightMinutes += duration;
  }

  if (currentSession) sessions.push(currentSession);
  return sessions;
}

async function extractAppleHealthXML(zipBuffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipFile) => {
      if (err) {
        reject(new Error(`Failed to read ZIP file: ${err.message}`));
        return;
      }

      if (!zipFile) {
        reject(new Error('Invalid ZIP file'));
        return;
      }

      zipFile.readEntry();
      
      zipFile.on('entry', (entry) => {
        if (entry.fileName === 'apple_health_export/export.xml' || entry.fileName === 'export.xml') {
          zipFile.openReadStream(entry, (err, readStream) => {
            if (err) {
              reject(new Error(`Failed to read export.xml: ${err.message}`));
              return;
            }

            if (!readStream) {
              reject(new Error('Could not open export.xml'));
              return;
            }

            const chunks: Buffer[] = [];
            readStream.on('data', (chunk) => chunks.push(chunk));
            readStream.on('end', () => {
              const xmlData = Buffer.concat(chunks).toString('utf8');
              resolve(xmlData);
            });
            readStream.on('error', (err) => reject(err));
          });
        } else {
          zipFile.readEntry();
        }
      });

      zipFile.on('end', () => {
        reject(new Error('export.xml not found in ZIP file'));
      });

      zipFile.on('error', (err) => {
        reject(new Error(`ZIP processing error: ${err.message}`));
      });
    });
  });
}

async function parseAppleHealthXML(xmlData: string): Promise<any> {
  return new Promise((resolve, reject) => {
    parseString(xmlData, (err, result) => {
      if (err) {
        reject(new Error(`Failed to parse Apple Health XML: ${err.message}`));
        return;
      }

      const healthData = result?.HealthData;
      if (!healthData) {
        reject(new Error('Invalid Apple Health XML format - missing HealthData'));
        return;
      }

      // Extract relevant data
      const records = healthData.Record || [];
      const heartRateRecords = records.filter((r: any) => 
        r.$.type === 'HKQuantityTypeIdentifierHeartRate'
      );
      const stepsRecords = records.filter((r: any) => 
        r.$.type === 'HKQuantityTypeIdentifierStepCount'
      );
      const sleepRecords = records.filter((r: any) => 
        r.$.type === 'HKCategoryTypeIdentifierSleepAnalysis'
      );

      resolve({
        heartRate: heartRateRecords.map((r: any) => ({
          type: 'heart_rate',
          value: parseFloat(r.$.value),
          unit: r.$.unit,
          startDate: r.$.startDate,
          endDate: r.$.endDate,
          uuid: r.$.uuid || `apple_${Date.now()}_${Math.random()}`
        })),
        steps: stepsRecords.map((r: any) => ({
          type: 'steps',
          value: parseInt(r.$.value),
          unit: r.$.unit || 'count',
          startDate: r.$.startDate,
          endDate: r.$.endDate,
          uuid: r.$.uuid || `apple_steps_${Date.now()}_${Math.random()}`
        })),
        sleep: sleepRecords.map((r: any) => ({
          type: 'sleep',
          value: parseInt(r.$.value), // 0=inBed, 1=asleep, 2=awake
          startDate: r.$.startDate,
          endDate: r.$.endDate,
          uuid: r.$.uuid || `apple_sleep_${Date.now()}_${Math.random()}`
        }))
      });
    });
  });
}
