import {
  users,
  symptomLogs,
  symptomEntries,
  waterIntakeLogs,
  sodiumIntakeLogs,
  products,
  productCategories,
  aiInteractions,
  userFavorites,
  vitalsLogs,
  sleepLogs,
  dataImportSources,
  importConflicts,
  cartItems,
  orders,
  orderItems,
  productReviews,
  reviewHelpfulness,
  type User,
  type UpsertUser,
  type SymptomLog,
  type InsertSymptomLog,
  type SymptomEntry,
  type InsertSymptomEntry,
  type WaterIntakeLog,
  type InsertWaterIntakeLog,
  type SodiumIntakeLog,
  type InsertSodiumIntakeLog,
  type Product,
  type ProductCategory,
  type InsertProduct,
  type InsertProductCategory,
  type AIInteraction,
  type UserFavorite,
  type VitalsLog,
  type InsertVitalsLog,
  type SleepLog,
  type InsertSleepLog,
  type DataImportSource,
  type InsertDataImportSource,
  type ImportConflict,
  type CartItem,
  type InsertCartItem,
  type Order,
  type InsertOrder,
  type OrderItem,
  type InsertOrderItem,
  type ProductReview,
  type InsertProductReview,
  type ReviewHelpfulness,
  type InsertReviewHelpfulness,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, inArray, gte, lte } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserProfile(userId: string, profileData: {
    onboardingCompleted?: boolean;
    edsType?: string | null;
    diagnosisYear?: number | null;
    primarySymptoms?: string[] | null;
    experienceLevel?: string | null;
    dailyGoals?: string[] | null;
  }): Promise<User>;
  
  // Enhanced symptom tracking operations
  createSymptomLog(log: InsertSymptomLog): Promise<SymptomLog>;
  createSymptomEntry(entry: InsertSymptomEntry): Promise<SymptomEntry>;
  getUserSymptomLogs(userId: string, limit?: number): Promise<SymptomLog[]>;
  getUserSymptomLogsWithEntries(userId: string, limit?: number): Promise<(SymptomLog & { symptomEntries: SymptomEntry[] })[]>;
  getSymptomLog(id: string): Promise<SymptomLog | undefined>;
  getSymptomLogWithEntries(id: string): Promise<(SymptomLog & { symptomEntries: SymptomEntry[] }) | undefined>;
  updateSymptomLogReflection(id: string, reflection: string): Promise<void>;
  
  // Water and sodium tracking
  createWaterIntakeLog(log: InsertWaterIntakeLog): Promise<WaterIntakeLog>;
  createSodiumIntakeLog(log: InsertSodiumIntakeLog): Promise<SodiumIntakeLog>;
  getUserDailyIntakes(userId: string, date?: Date): Promise<{ waterMl: number; sodiumMg: number }>;
  
  // AI interaction operations
  createAIInteraction(userId: string, symptomLogId: string | null, prompt: string, response: string, sentiment?: string): Promise<AIInteraction>;
  getUserAIInteractions(userId: string, limit?: number): Promise<AIInteraction[]>;
  updateAIInteractionFeedback(id: string, userId: string, feltUnderstood: boolean): Promise<void>;
  
  // Export-specific operations (unlimited with date filtering)
  exportUserSymptomLogs(userId: string, fromDate?: Date, toDate?: Date): Promise<SymptomLog[]>;
  exportUserAIInteractions(userId: string, fromDate?: Date, toDate?: Date): Promise<AIInteraction[]>;
  
  // Product operations
  getAllProductCategories(): Promise<ProductCategory[]>;
  getProductsByCategory(categoryId?: string): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  createProductCategory(category: InsertProductCategory): Promise<ProductCategory>;
  
  // Product review operations
  createProductReview(review: InsertProductReview): Promise<ProductReview>;
  getProductReviews(productId: string): Promise<(ProductReview & { user: { firstName: string; lastName: string } })[]>;
  getUserReviews(userId: string): Promise<(ProductReview & { product: Product })[]>;
  updateReviewApproval(id: string, isApproved: boolean, moderatorNotes?: string): Promise<void>;
  markReviewHelpful(userId: string, reviewId: string, isHelpful: boolean): Promise<void>;
  
  // User favorites
  toggleUserFavorite(userId: string, productId: string): Promise<boolean>;
  getUserFavorites(userId: string): Promise<UserFavorite[]>;
  
  // Cart operations
  createCartItem(item: InsertCartItem): Promise<CartItem>;
  getCartItems(userId: string): Promise<(CartItem & { product: Product })[]>;
  updateCartItem(id: string, userId: string, quantity: number): Promise<void>;
  deleteCartItem(id: string, userId: string): Promise<void>;
  clearCart(userId: string): Promise<void>;
  
  // Order operations
  createOrder(order: InsertOrder): Promise<Order>;
  createOrderItem(orderItem: InsertOrderItem): Promise<OrderItem>;
  getOrders(userId: string): Promise<Order[]>;
  getOrder(id: string, userId: string): Promise<(Order & { orderItems: (OrderItem & { product: Product })[] }) | undefined>;
  updateOrderStatus(id: string, status: string): Promise<void>;
  
  // Vitals operations
  createVitalsLog(log: InsertVitalsLog): Promise<VitalsLog>;
  getUserVitalsLogs(userId: string, type?: string, limit?: number): Promise<VitalsLog[]>;
  getVitalsLog(id: string): Promise<VitalsLog | undefined>;
  exportUserVitalsLogs(userId: string, fromDate?: Date, toDate?: Date): Promise<VitalsLog[]>;
  
  // Sleep operations
  createSleepLog(log: InsertSleepLog): Promise<SleepLog>;
  getUserSleepLogs(userId: string, limit?: number): Promise<SleepLog[]>;
  getSleepLog(id: string): Promise<SleepLog | undefined>;
  exportUserSleepLogs(userId: string, fromDate?: Date, toDate?: Date): Promise<SleepLog[]>;
  
  // Data import source management
  createDataImportSource(source: InsertDataImportSource): Promise<DataImportSource>;
  getUserDataImportSources(userId: string): Promise<DataImportSource[]>;
  updateDataImportSource(id: string, updates: Partial<InsertDataImportSource>): Promise<DataImportSource>;
  deleteDataImportSource(id: string): Promise<void>;
  
  // Import conflict management
  createImportConflict(conflict: Omit<ImportConflict, 'id' | 'createdAt' | 'resolvedAt' | 'resolution'>): Promise<ImportConflict>;
  getUserImportConflicts(userId: string, status?: string): Promise<ImportConflict[]>;
  resolveImportConflict(id: string, resolution: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations (mandatory for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          // Only update mutable fields, preserve ID to maintain FK relationships
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateUserProfile(userId: string, profileData: {
    onboardingCompleted?: boolean;
    edsType?: string | null;
    diagnosisYear?: number | null;
    primarySymptoms?: string[] | null;
    experienceLevel?: string | null;
    dailyGoals?: string[] | null;
  }): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        ...profileData,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  // Enhanced symptom tracking operations
  async createSymptomLog(log: InsertSymptomLog): Promise<SymptomLog> {
    const [symptomLog] = await db
      .insert(symptomLogs)
      .values(log)
      .returning();
    return symptomLog;
  }

  async createSymptomEntry(entry: InsertSymptomEntry): Promise<SymptomEntry> {
    const [symptomEntry] = await db
      .insert(symptomEntries)
      .values(entry)
      .returning();
    return symptomEntry;
  }

  async getUserSymptomLogs(userId: string, limit = 50): Promise<SymptomLog[]> {
    return await db
      .select()
      .from(symptomLogs)
      .where(eq(symptomLogs.userId, userId))
      .orderBy(desc(symptomLogs.timestamp))
      .limit(limit);
  }

  async getUserSymptomLogsWithEntries(userId: string, limit = 50): Promise<(SymptomLog & { symptomEntries: SymptomEntry[] })[]> {
    const logs = await db
      .select()
      .from(symptomLogs)
      .where(eq(symptomLogs.userId, userId))
      .orderBy(desc(symptomLogs.timestamp))
      .limit(limit);

    const logsWithEntries = await Promise.all(
      logs.map(async (log) => {
        const entries = await db
          .select()
          .from(symptomEntries)
          .where(eq(symptomEntries.symptomLogId, log.id))
          .orderBy(symptomEntries.symptomName);
        
        return {
          ...log,
          symptomEntries: entries,
        };
      })
    );

    return logsWithEntries;
  }

  async getSymptomLog(id: string): Promise<SymptomLog | undefined> {
    const [log] = await db.select().from(symptomLogs).where(eq(symptomLogs.id, id));
    return log;
  }

  async getSymptomLogWithEntries(id: string): Promise<(SymptomLog & { symptomEntries: SymptomEntry[] }) | undefined> {
    const [log] = await db.select().from(symptomLogs).where(eq(symptomLogs.id, id));
    if (!log) return undefined;

    const entries = await db
      .select()
      .from(symptomEntries)
      .where(eq(symptomEntries.symptomLogId, id))
      .orderBy(symptomEntries.symptomName);

    return {
      ...log,
      symptomEntries: entries,
    };
  }

  // Water and sodium tracking
  async createWaterIntakeLog(log: InsertWaterIntakeLog): Promise<WaterIntakeLog> {
    const [waterLog] = await db
      .insert(waterIntakeLogs)
      .values(log)
      .returning();
    return waterLog;
  }

  async createSodiumIntakeLog(log: InsertSodiumIntakeLog): Promise<SodiumIntakeLog> {
    const [sodiumLog] = await db
      .insert(sodiumIntakeLogs)
      .values(log)
      .returning();
    return sodiumLog;
  }

  async getUserDailyIntakes(userId: string, date?: Date): Promise<{ waterMl: number; sodiumMg: number }> {
    const targetDate = date || new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Get water intake for the day
    const waterResults = await db
      .select()
      .from(waterIntakeLogs)
      .where(
        and(
          eq(waterIntakeLogs.userId, userId),
          gte(waterIntakeLogs.timestamp, startOfDay),
          lte(waterIntakeLogs.timestamp, endOfDay)
        )
      );
    
    const waterMl = waterResults.reduce((total, log) => total + log.amountMl, 0);

    // Get sodium intake for the day
    const sodiumResults = await db
      .select()
      .from(sodiumIntakeLogs)
      .where(
        and(
          eq(sodiumIntakeLogs.userId, userId),
          gte(sodiumIntakeLogs.timestamp, startOfDay),
          lte(sodiumIntakeLogs.timestamp, endOfDay)
        )
      );
    
    const sodiumMg = sodiumResults.reduce((total, log) => total + log.amountMg, 0);

    return { waterMl, sodiumMg };
  }

  async updateSymptomLogReflection(id: string, reflection: string): Promise<void> {
    await db
      .update(symptomLogs)
      .set({ 
        aiReflection: reflection, 
        aiProcessed: true 
      })
      .where(eq(symptomLogs.id, id));
  }

  // AI interaction operations
  async createAIInteraction(
    userId: string, 
    symptomLogId: string | null, 
    prompt: string, 
    response: string, 
    sentiment?: string
  ): Promise<AIInteraction> {
    const [interaction] = await db
      .insert(aiInteractions)
      .values({
        userId,
        symptomLogId,
        prompt,
        response,
        sentiment,
      })
      .returning();
    return interaction;
  }

  async getUserAIInteractions(userId: string, limit = 20): Promise<AIInteraction[]> {
    return await db
      .select()
      .from(aiInteractions)
      .where(eq(aiInteractions.userId, userId))
      .orderBy(desc(aiInteractions.createdAt))
      .limit(limit);
  }

  async updateAIInteractionFeedback(id: string, userId: string, feltUnderstood: boolean): Promise<void> {
    const result = await db
      .update(aiInteractions)
      .set({ feltUnderstood })
      .where(and(eq(aiInteractions.id, id), eq(aiInteractions.userId, userId)))
      .returning({ id: aiInteractions.id });
    
    if (result.length === 0) {
      throw new Error("AI interaction not found or access denied");
    }
  }

  // Export-specific operations (unlimited with date filtering)
  async exportUserSymptomLogs(userId: string, fromDate?: Date, toDate?: Date): Promise<SymptomLog[]> {
    const conditions = [eq(symptomLogs.userId, userId)];
    
    if (fromDate) {
      conditions.push(gte(symptomLogs.timestamp, fromDate));
    }
    if (toDate) {
      conditions.push(lte(symptomLogs.timestamp, toDate));
    }
    
    return await db
      .select()
      .from(symptomLogs)
      .where(and(...conditions))
      .orderBy(desc(symptomLogs.timestamp));
  }

  async exportUserAIInteractions(userId: string, fromDate?: Date, toDate?: Date): Promise<AIInteraction[]> {
    const conditions = [eq(aiInteractions.userId, userId)];
    
    if (fromDate) {
      conditions.push(gte(aiInteractions.createdAt, fromDate));
    }
    if (toDate) {
      conditions.push(lte(aiInteractions.createdAt, toDate));
    }
    
    return await db
      .select()
      .from(aiInteractions)
      .where(and(...conditions))
      .orderBy(desc(aiInteractions.createdAt));
  }

  // Product operations
  async getAllProductCategories(): Promise<ProductCategory[]> {
    return await db.select().from(productCategories).orderBy(productCategories.name);
  }

  async getProductsByCategory(categoryId?: string): Promise<Product[]> {
    if (categoryId) {
      return await db.select().from(products)
        .where(and(eq(products.isActive, true), eq(products.categoryId, categoryId)))
        .orderBy(products.name);
    }
    
    return await db.select().from(products)
      .where(eq(products.isActive, true))
      .orderBy(products.name);
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db
      .insert(products)
      .values(product)
      .returning();
    return newProduct;
  }

  async createProductCategory(category: InsertProductCategory): Promise<ProductCategory> {
    const [newCategory] = await db
      .insert(productCategories)
      .values(category)
      .returning();
    return newCategory;
  }

  // Product review operations
  async createProductReview(review: InsertProductReview): Promise<ProductReview> {
    const [newReview] = await db
      .insert(productReviews)
      .values(review)
      .returning();
    return newReview;
  }

  async getProductReviews(productId: string): Promise<(ProductReview & { user: { firstName: string; lastName: string } })[]> {
    return await db
      .select({
        id: productReviews.id,
        userId: productReviews.userId,
        productId: productReviews.productId,
        orderId: productReviews.orderId,
        overallRating: productReviews.overallRating,
        edsHelpfulness: productReviews.edsHelpfulness,
        comfortRating: productReviews.comfortRating,
        durabilityRating: productReviews.durabilityRating,
        symptomReliefRating: productReviews.symptomReliefRating,
        reviewTitle: productReviews.reviewTitle,
        reviewText: productReviews.reviewText,
        prosText: productReviews.prosText,
        consText: productReviews.consText,
        recommendToEdsPatients: productReviews.recommendToEdsPatients,
        specificEdsSymptoms: productReviews.specificEdsSymptoms,
        dailyUseContext: productReviews.dailyUseContext,
        verifiedPurchase: productReviews.verifiedPurchase,
        isApproved: productReviews.isApproved,
        moderatorNotes: productReviews.moderatorNotes,
        helpfulCount: productReviews.helpfulCount,
        createdAt: productReviews.createdAt,
        updatedAt: productReviews.updatedAt,
        user: {
          firstName: users.firstName,
          lastName: users.lastName,
        },
      })
      .from(productReviews)
      .innerJoin(users, eq(productReviews.userId, users.id))
      .where(and(eq(productReviews.productId, productId), eq(productReviews.isApproved, true)))
      .orderBy(desc(productReviews.createdAt));
  }

  async getUserReviews(userId: string): Promise<(ProductReview & { product: Product })[]> {
    return await db
      .select({
        id: productReviews.id,
        userId: productReviews.userId,
        productId: productReviews.productId,
        orderId: productReviews.orderId,
        overallRating: productReviews.overallRating,
        edsHelpfulness: productReviews.edsHelpfulness,
        comfortRating: productReviews.comfortRating,
        durabilityRating: productReviews.durabilityRating,
        symptomReliefRating: productReviews.symptomReliefRating,
        reviewTitle: productReviews.reviewTitle,
        reviewText: productReviews.reviewText,
        prosText: productReviews.prosText,
        consText: productReviews.consText,
        recommendToEdsPatients: productReviews.recommendToEdsPatients,
        specificEdsSymptoms: productReviews.specificEdsSymptoms,
        dailyUseContext: productReviews.dailyUseContext,
        verifiedPurchase: productReviews.verifiedPurchase,
        isApproved: productReviews.isApproved,
        moderatorNotes: productReviews.moderatorNotes,
        helpfulCount: productReviews.helpfulCount,
        createdAt: productReviews.createdAt,
        updatedAt: productReviews.updatedAt,
        product: products,
      })
      .from(productReviews)
      .innerJoin(products, eq(productReviews.productId, products.id))
      .where(eq(productReviews.userId, userId))
      .orderBy(desc(productReviews.createdAt));
  }

  async updateReviewApproval(id: string, isApproved: boolean, moderatorNotes?: string): Promise<void> {
    await db
      .update(productReviews)
      .set({ 
        isApproved, 
        moderatorNotes,
        updatedAt: new Date() 
      })
      .where(eq(productReviews.id, id));
  }

  async markReviewHelpful(userId: string, reviewId: string, isHelpful: boolean): Promise<void> {
    // First check if user already marked this review
    const [existing] = await db
      .select()
      .from(reviewHelpfulness)
      .where(and(
        eq(reviewHelpfulness.userId, userId),
        eq(reviewHelpfulness.reviewId, reviewId)
      ));

    if (existing) {
      // Update existing helpfulness rating
      await db
        .update(reviewHelpfulness)
        .set({ isHelpful })
        .where(eq(reviewHelpfulness.id, existing.id));
    } else {
      // Create new helpfulness rating
      await db
        .insert(reviewHelpfulness)
        .values({ userId, reviewId, isHelpful });
    }

    // Update helpful count on review
    const helpfulCountResult = await db
      .select({ count: productReviews.id })
      .from(reviewHelpfulness)
      .where(and(
        eq(reviewHelpfulness.reviewId, reviewId),
        eq(reviewHelpfulness.isHelpful, true)
      ));
    
    await db
      .update(productReviews)
      .set({ 
        helpfulCount: helpfulCountResult.length,
        updatedAt: new Date() 
      })
      .where(eq(productReviews.id, reviewId));
  }

  // User favorites
  async toggleUserFavorite(userId: string, productId: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(userFavorites)
      .where(and(
        eq(userFavorites.userId, userId),
        eq(userFavorites.productId, productId)
      ));

    if (existing) {
      await db
        .delete(userFavorites)
        .where(eq(userFavorites.id, existing.id));
      return false; // Removed from favorites
    } else {
      await db
        .insert(userFavorites)
        .values({ userId, productId });
      return true; // Added to favorites
    }
  }

  async getUserFavorites(userId: string): Promise<UserFavorite[]> {
    return await db
      .select()
      .from(userFavorites)
      .where(eq(userFavorites.userId, userId));
  }

  // Cart operations
  async createCartItem(item: InsertCartItem): Promise<CartItem> {
    const [newCartItem] = await db
      .insert(cartItems)
      .values(item)
      .returning();
    return newCartItem;
  }

  async getCartItems(userId: string): Promise<(CartItem & { product: Product })[]> {
    return await db
      .select({
        id: cartItems.id,
        userId: cartItems.userId,
        productId: cartItems.productId,
        quantity: cartItems.quantity,
        createdAt: cartItems.createdAt,
        product: products,
      })
      .from(cartItems)
      .innerJoin(products, eq(cartItems.productId, products.id))
      .where(eq(cartItems.userId, userId))
      .orderBy(desc(cartItems.createdAt));
  }

  async updateCartItem(id: string, userId: string, quantity: number): Promise<void> {
    await db
      .update(cartItems)
      .set({ quantity })
      .where(and(eq(cartItems.id, id), eq(cartItems.userId, userId)));
  }

  async deleteCartItem(id: string, userId: string): Promise<void> {
    await db
      .delete(cartItems)
      .where(and(eq(cartItems.id, id), eq(cartItems.userId, userId)));
  }

  async clearCart(userId: string): Promise<void> {
    await db
      .delete(cartItems)
      .where(eq(cartItems.userId, userId));
  }

  // Order operations
  async createOrder(order: InsertOrder): Promise<Order> {
    const [newOrder] = await db
      .insert(orders)
      .values(order)
      .returning();
    return newOrder;
  }

  async createOrderItem(orderItem: InsertOrderItem): Promise<OrderItem> {
    const [newOrderItem] = await db
      .insert(orderItems)
      .values(orderItem)
      .returning();
    return newOrderItem;
  }

  async getOrders(userId: string): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.orderDate));
  }

  async getOrder(id: string, userId: string): Promise<(Order & { orderItems: (OrderItem & { product: Product })[] }) | undefined> {
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.userId, userId)));

    if (!order) return undefined;

    const items = await db
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        productId: orderItems.productId,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        totalPrice: orderItems.totalPrice,
        createdAt: orderItems.createdAt,
        product: products,
      })
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, id));

    return { ...order, orderItems: items };
  }

  async updateOrderStatus(id: string, status: string): Promise<void> {
    const updateData: any = { status };
    if (status === 'completed') {
      updateData.completedAt = new Date();
    }

    await db
      .update(orders)
      .set(updateData)
      .where(eq(orders.id, id));
  }

  // Vitals operations
  async createVitalsLog(log: InsertVitalsLog): Promise<VitalsLog> {
    const [newVitalsLog] = await db
      .insert(vitalsLogs)
      .values(log)
      .returning();
    return newVitalsLog;
  }

  async getUserVitalsLogs(userId: string, type?: string, limit = 1000): Promise<VitalsLog[]> {
    const conditions = [eq(vitalsLogs.userId, userId)];
    if (type) {
      conditions.push(eq(vitalsLogs.type, type));
    }

    return await db
      .select()
      .from(vitalsLogs)
      .where(and(...conditions))
      .orderBy(desc(vitalsLogs.timestamp))
      .limit(limit);
  }

  async getVitalsLog(id: string): Promise<VitalsLog | undefined> {
    const [vitalsLog] = await db.select().from(vitalsLogs).where(eq(vitalsLogs.id, id));
    return vitalsLog;
  }

  async exportUserVitalsLogs(userId: string, fromDate?: Date, toDate?: Date): Promise<VitalsLog[]> {
    const conditions = [eq(vitalsLogs.userId, userId)];
    
    if (fromDate) {
      conditions.push(gte(vitalsLogs.timestamp, fromDate));
    }
    if (toDate) {
      conditions.push(lte(vitalsLogs.timestamp, toDate));
    }
    
    return await db
      .select()
      .from(vitalsLogs)
      .where(and(...conditions))
      .orderBy(desc(vitalsLogs.timestamp));
  }

  // Sleep operations
  async createSleepLog(log: InsertSleepLog): Promise<SleepLog> {
    const [newSleepLog] = await db
      .insert(sleepLogs)
      .values(log)
      .returning();
    return newSleepLog;
  }

  async getUserSleepLogs(userId: string, limit = 1000): Promise<SleepLog[]> {
    return await db
      .select()
      .from(sleepLogs)
      .where(eq(sleepLogs.userId, userId))
      .orderBy(desc(sleepLogs.bedtime))
      .limit(limit);
  }

  async getSleepLog(id: string): Promise<SleepLog | undefined> {
    const [sleepLog] = await db.select().from(sleepLogs).where(eq(sleepLogs.id, id));
    return sleepLog;
  }

  async exportUserSleepLogs(userId: string, fromDate?: Date, toDate?: Date): Promise<SleepLog[]> {
    const conditions = [eq(sleepLogs.userId, userId)];
    
    if (fromDate) {
      conditions.push(gte(sleepLogs.bedtime, fromDate));
    }
    if (toDate) {
      conditions.push(lte(sleepLogs.bedtime, toDate));
    }
    
    return await db
      .select()
      .from(sleepLogs)
      .where(and(...conditions))
      .orderBy(desc(sleepLogs.bedtime));
  }

  // Data import source management
  async createDataImportSource(source: InsertDataImportSource): Promise<DataImportSource> {
    const [newSource] = await db
      .insert(dataImportSources)
      .values(source)
      .returning();
    return newSource;
  }

  async getUserDataImportSources(userId: string): Promise<DataImportSource[]> {
    return await db
      .select()
      .from(dataImportSources)
      .where(eq(dataImportSources.userId, userId))
      .orderBy(desc(dataImportSources.createdAt));
  }

  async updateDataImportSource(id: string, updates: Partial<InsertDataImportSource>): Promise<DataImportSource> {
    const [updatedSource] = await db
      .update(dataImportSources)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(dataImportSources.id, id))
      .returning();
    return updatedSource;
  }

  async deleteDataImportSource(id: string): Promise<void> {
    await db
      .delete(dataImportSources)
      .where(eq(dataImportSources.id, id));
  }

  // Import conflict management
  async createImportConflict(conflict: Omit<ImportConflict, 'id' | 'createdAt' | 'resolvedAt' | 'resolution'>): Promise<ImportConflict> {
    const [newConflict] = await db
      .insert(importConflicts)
      .values(conflict)
      .returning();
    return newConflict;
  }

  async getUserImportConflicts(userId: string, status?: string): Promise<ImportConflict[]> {
    const conditions = [eq(importConflicts.userId, userId)];
    if (status) {
      conditions.push(eq(importConflicts.status, status));
    }

    return await db
      .select()
      .from(importConflicts)
      .where(and(...conditions))
      .orderBy(desc(importConflicts.createdAt));
  }

  async resolveImportConflict(id: string, resolution: string): Promise<void> {
    await db
      .update(importConflicts)
      .set({ 
        status: 'resolved',
        resolution,
        resolvedAt: new Date()
      })
      .where(eq(importConflicts.id, id));
  }
}

export const storage = new DatabaseStorage();
