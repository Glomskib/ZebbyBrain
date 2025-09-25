import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { generateEmpathicReflection, generatePersonalizedInsight } from "./openai";
import { insertSymptomLogSchema, products, productCategories, users } from "@shared/schema";
import { db } from "./db";
import { z } from "zod";
import Stripe from "stripe";
import { eq } from "drizzle-orm";

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
            const subscriptionId = session.subscription as string;
            
            if (subscriptionId) {
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

  const httpServer = createServer(app);
  return httpServer;
}
