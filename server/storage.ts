import {
  users,
  symptomLogs,
  products,
  productCategories,
  aiInteractions,
  userFavorites,
  type User,
  type UpsertUser,
  type SymptomLog,
  type InsertSymptomLog,
  type Product,
  type ProductCategory,
  type InsertProduct,
  type InsertProductCategory,
  type AIInteraction,
  type UserFavorite,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, inArray, gte, lte } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Symptom tracking operations
  createSymptomLog(log: InsertSymptomLog): Promise<SymptomLog>;
  getUserSymptomLogs(userId: string, limit?: number): Promise<SymptomLog[]>;
  getSymptomLog(id: string): Promise<SymptomLog | undefined>;
  updateSymptomLogReflection(id: string, reflection: string): Promise<void>;
  
  // AI interaction operations
  createAIInteraction(userId: string, symptomLogId: string | null, prompt: string, response: string, sentiment?: string): Promise<AIInteraction>;
  getUserAIInteractions(userId: string, limit?: number): Promise<AIInteraction[]>;
  
  // Export-specific operations (unlimited with date filtering)
  exportUserSymptomLogs(userId: string, fromDate?: Date, toDate?: Date): Promise<SymptomLog[]>;
  exportUserAIInteractions(userId: string, fromDate?: Date, toDate?: Date): Promise<AIInteraction[]>;
  
  // Product operations
  getAllProductCategories(): Promise<ProductCategory[]>;
  getProductsByCategory(categoryId?: string): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  createProductCategory(category: InsertProductCategory): Promise<ProductCategory>;
  
  // User favorites
  toggleUserFavorite(userId: string, productId: string): Promise<boolean>;
  getUserFavorites(userId: string): Promise<UserFavorite[]>;
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
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Symptom tracking operations
  async createSymptomLog(log: InsertSymptomLog): Promise<SymptomLog> {
    const [symptomLog] = await db
      .insert(symptomLogs)
      .values(log)
      .returning();
    return symptomLog;
  }

  async getUserSymptomLogs(userId: string, limit = 50): Promise<SymptomLog[]> {
    return await db
      .select()
      .from(symptomLogs)
      .where(eq(symptomLogs.userId, userId))
      .orderBy(desc(symptomLogs.timestamp))
      .limit(limit);
  }

  async getSymptomLog(id: string): Promise<SymptomLog | undefined> {
    const [log] = await db.select().from(symptomLogs).where(eq(symptomLogs.id, id));
    return log;
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
}

export const storage = new DatabaseStorage();
