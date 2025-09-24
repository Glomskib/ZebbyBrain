import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { generateEmpathicReflection, generatePersonalizedInsight } from "./openai";
import { insertSymptomLogSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

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

  // Symptom logging routes
  app.post('/api/symptoms', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = insertSymptomLogSchema.parse({
        ...req.body,
        userId,
      });

      // Create the symptom log
      const symptomLog = await storage.createSymptomLog(validatedData);

      // Generate AI reflection asynchronously
      generateEmpathicReflection(
        symptomLog.symptoms,
        symptomLog.intensity,
        symptomLog.notes || undefined
      ).then(async (aiResponse) => {
        // Update the symptom log with AI reflection
        await storage.updateSymptomLogReflection(symptomLog.id, aiResponse.reflection);
        
        // Store AI interaction
        await storage.createAIInteraction(
          userId,
          symptomLog.id,
          `Symptoms: ${symptomLog.symptoms.join(", ")}, Intensity: ${symptomLog.intensity}`,
          aiResponse.reflection,
          aiResponse.sentiment
        );
      }).catch(error => {
        console.error("Failed to generate AI reflection:", error);
      });

      res.json(symptomLog);
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
      const symptoms = await storage.getUserSymptomLogs(userId, limit);
      res.json(symptoms);
    } catch (error) {
      console.error("Error fetching symptom logs:", error);
      res.status(500).json({ message: "Failed to fetch symptom logs" });
    }
  });

  app.get('/api/symptoms/:id', isAuthenticated, async (req: any, res) => {
    try {
      const symptomLog = await storage.getSymptomLog(req.params.id);
      if (!symptomLog) {
        return res.status(404).json({ message: "Symptom log not found" });
      }
      
      // Check if user owns this symptom log
      if (symptomLog.userId !== req.user.claims.sub) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      res.json(symptomLog);
    } catch (error) {
      console.error("Error fetching symptom log:", error);
      res.status(500).json({ message: "Failed to fetch symptom log" });
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

      for (const category of categories) {
        await storage.createProductCategory(category);
      }

      res.json({ message: "Default data initialized" });
    } catch (error) {
      console.error("Error initializing data:", error);
      res.status(500).json({ message: "Failed to initialize data" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
