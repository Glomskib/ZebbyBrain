import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  decimal,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Symptom logs table
export const symptomLogs = pgTable("symptom_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  symptoms: text("symptoms").array().notNull(), // Array of symptom tags
  intensity: integer("intensity").notNull(), // 1-10 scale
  notes: text("notes"),
  timestamp: timestamp("timestamp").notNull(),
  aiReflection: text("ai_reflection"),
  aiProcessed: boolean("ai_processed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Product categories for marketplace
export const productCategories = pgTable("product_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description"),
  icon: varchar("icon"), // Emoji or icon identifier
  createdAt: timestamp("created_at").defaultNow(),
});

// Products table for marketplace
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  categoryId: varchar("category_id").notNull().references(() => productCategories.id),
  name: varchar("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  originalPrice: decimal("original_price", { precision: 10, scale: 2 }),
  discountPercentage: integer("discount_percentage"),
  imageUrl: varchar("image_url"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// User favorites/wishlist
export const userFavorites = pgTable("user_favorites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  productId: varchar("product_id").notNull().references(() => products.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// AI interaction history
export const aiInteractions = pgTable("ai_interactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  symptomLogId: varchar("symptom_log_id").references(() => symptomLogs.id),
  prompt: text("prompt").notNull(),
  response: text("response").notNull(),
  sentiment: varchar("sentiment"), // positive, empathetic, validating, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  symptomLogs: many(symptomLogs),
  favorites: many(userFavorites),
  aiInteractions: many(aiInteractions),
}));

export const symptomLogsRelations = relations(symptomLogs, ({ one, many }) => ({
  user: one(users, {
    fields: [symptomLogs.userId],
    references: [users.id],
  }),
  aiInteractions: many(aiInteractions),
}));

export const productCategoriesRelations = relations(productCategories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(productCategories, {
    fields: [products.categoryId],
    references: [productCategories.id],
  }),
  favorites: many(userFavorites),
}));

export const userFavoritesRelations = relations(userFavorites, ({ one }) => ({
  user: one(users, {
    fields: [userFavorites.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [userFavorites.productId],
    references: [products.id],
  }),
}));

export const aiInteractionsRelations = relations(aiInteractions, ({ one }) => ({
  user: one(users, {
    fields: [aiInteractions.userId],
    references: [users.id],
  }),
  symptomLog: one(symptomLogs, {
    fields: [aiInteractions.symptomLogId],
    references: [symptomLogs.id],
  }),
}));

// Schema types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export const insertSymptomLogSchema = createInsertSchema(symptomLogs).omit({
  id: true,
  createdAt: true,
  aiReflection: true,
  aiProcessed: true,
});
export type InsertSymptomLog = z.infer<typeof insertSymptomLogSchema>;
export type SymptomLog = typeof symptomLogs.$inferSelect;

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

export const insertProductCategorySchema = createInsertSchema(productCategories).omit({
  id: true,
  createdAt: true,
});
export type InsertProductCategory = z.infer<typeof insertProductCategorySchema>;
export type ProductCategory = typeof productCategories.$inferSelect;

export type AIInteraction = typeof aiInteractions.$inferSelect;
export type UserFavorite = typeof userFavorites.$inferSelect;
