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
  stripeCustomerId: varchar("stripe_customer_id").unique(),
  plan: varchar("plan").default("free"), // "free" | "plus"
  planStatus: varchar("plan_status").default("inactive"), // "active" | "past_due" | "canceled" | "inactive"
  currentPeriodEnd: timestamp("current_period_end"),
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

// Vitals tracking (HR, BP, etc.)
export const vitalsLogs = pgTable("vitals_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: varchar("type").notNull(), // "heart_rate", "blood_pressure", "weight", "oxygen_saturation", etc.
  value: decimal("value", { precision: 10, scale: 2 }).notNull(), // Primary measurement value
  systolic: integer("systolic"), // For blood pressure
  diastolic: integer("diastolic"), // For blood pressure
  unit: varchar("unit").notNull(), // "bpm", "mmHg", "kg", "%", etc.
  source: varchar("source").default("manual"), // "manual", "google_fit", "apple_health"
  sourceId: varchar("source_id"), // External source identifier for deduplication
  timestamp: timestamp("timestamp").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Sleep tracking
export const sleepLogs = pgTable("sleep_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  bedtime: timestamp("bedtime").notNull(),
  wakeTime: timestamp("wake_time").notNull(),
  totalMinutes: integer("total_minutes").notNull(),
  deepMinutes: integer("deep_minutes"),
  remMinutes: integer("rem_minutes"),
  lightMinutes: integer("light_minutes"),
  awakeMinutes: integer("awake_minutes"),
  quality: integer("quality"), // 1-10 scale, optional user rating
  source: varchar("source").default("manual"), // "manual", "google_fit", "apple_health"
  sourceId: varchar("source_id"), // External source identifier for deduplication
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Data import sources configuration
export const dataImportSources = pgTable("data_import_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  source: varchar("source").notNull(), // "google_fit", "apple_health"
  isEnabled: boolean("is_enabled").default(false),
  accessToken: text("access_token"), // Encrypted token for API access
  refreshToken: text("refresh_token"), // For token renewal
  tokenExpiry: timestamp("token_expiry"),
  lastSync: timestamp("last_sync"),
  syncPreferences: jsonb("sync_preferences"), // What data types to sync
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Import conflicts for manual review
export const importConflicts = pgTable("import_conflicts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  source: varchar("source").notNull(),
  dataType: varchar("data_type").notNull(), // "vitals", "sleep"
  existingDataId: varchar("existing_data_id"), // Reference to existing record
  importData: jsonb("import_data").notNull(), // The conflicting data to import
  conflictReason: varchar("conflict_reason").notNull(), // "duplicate", "similar_time", "different_values"
  status: varchar("status").default("pending"), // "pending", "resolved", "ignored"
  resolution: varchar("resolution"), // "keep_existing", "use_import", "merge"
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  symptomLogs: many(symptomLogs),
  favorites: many(userFavorites),
  aiInteractions: many(aiInteractions),
  vitalsLogs: many(vitalsLogs),
  sleepLogs: many(sleepLogs),
  dataImportSources: many(dataImportSources),
  importConflicts: many(importConflicts),
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

export const vitalsLogsRelations = relations(vitalsLogs, ({ one }) => ({
  user: one(users, {
    fields: [vitalsLogs.userId],
    references: [users.id],
  }),
}));

export const sleepLogsRelations = relations(sleepLogs, ({ one }) => ({
  user: one(users, {
    fields: [sleepLogs.userId],
    references: [users.id],
  }),
}));

export const dataImportSourcesRelations = relations(dataImportSources, ({ one }) => ({
  user: one(users, {
    fields: [dataImportSources.userId],
    references: [users.id],
  }),
}));

export const importConflictsRelations = relations(importConflicts, ({ one }) => ({
  user: one(users, {
    fields: [importConflicts.userId],
    references: [users.id],
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
}).extend({
  timestamp: z.string().datetime().transform((str) => new Date(str))
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

// Health data types
export const insertVitalsLogSchema = createInsertSchema(vitalsLogs).omit({
  id: true,
  createdAt: true,
}).extend({
  timestamp: z.string().datetime().transform((str) => new Date(str))
});
export type InsertVitalsLog = z.infer<typeof insertVitalsLogSchema>;
export type VitalsLog = typeof vitalsLogs.$inferSelect;

export const insertSleepLogSchema = createInsertSchema(sleepLogs).omit({
  id: true,
  createdAt: true,
}).extend({
  bedtime: z.string().datetime().transform((str) => new Date(str)),
  wakeTime: z.string().datetime().transform((str) => new Date(str))
});
export type InsertSleepLog = z.infer<typeof insertSleepLogSchema>;
export type SleepLog = typeof sleepLogs.$inferSelect;

export const insertDataImportSourceSchema = createInsertSchema(dataImportSources).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDataImportSource = z.infer<typeof insertDataImportSourceSchema>;
export type DataImportSource = typeof dataImportSources.$inferSelect;

export type ImportConflict = typeof importConflicts.$inferSelect;
