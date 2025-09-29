import { sql } from 'drizzle-orm';
import {
  index,
  uniqueIndex,
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
  
  // EDS-specific onboarding and profile fields
  onboardingCompleted: boolean("onboarding_completed").default(false),
  edsType: varchar("eds_type"), // "hEDS", "cEDS", "vEDS", "suspected", "other_rare_condition", null for not specified
  diagnosisYear: integer("diagnosis_year"), // Year diagnosed (e.g., 2020)
  primarySymptoms: text("primary_symptoms").array(), // ["Joint Pain", "POTS", "Fatigue", etc.]
  experienceLevel: varchar("experience_level"), // "new_to_eds", "learning_to_manage", "experienced"
  dailyGoals: text("daily_goals").array(), // ["Track symptoms", "Monitor POTS", "Find helpful products", etc.]
  
  // Data retention settings (in months, -1 for keep forever)
  symptomLogsRetentionMonths: integer("symptom_logs_retention_months").default(36), // Default 3 years
  vitalsLogsRetentionMonths: integer("vitals_logs_retention_months").default(36), // Default 3 years
  sleepLogsRetentionMonths: integer("sleep_logs_retention_months").default(36), // Default 3 years
  aiInteractionsRetentionMonths: integer("ai_interactions_retention_months").default(24), // Default 2 years
  
  // Account deletion (soft delete with 7-day recovery)
  deletedAt: timestamp("deleted_at"), // null = active, timestamp = soft deleted
  deletionReason: text("deletion_reason"), // Optional reason for deletion
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Symptom logs table - now represents a symptom logging session
export const symptomLogs = pgTable("symptom_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  timestamp: timestamp("timestamp").notNull(),
  notes: text("notes"), // Overall session notes
  // Contextual data captured at time of logging
  weatherTemp: decimal("weather_temp", { precision: 5, scale: 2 }), // Temperature in Celsius
  weatherCondition: varchar("weather_condition"), // "sunny", "rainy", "cloudy", etc.
  weatherLocation: varchar("weather_location"), // City/location for weather data
  waterIntakeCurrentMl: integer("water_intake_current_ml"), // Current day water intake in ml
  heartRateBpm: integer("heart_rate_bpm"), // Heart rate at time of logging
  sodiumIntakeCurrentMg: integer("sodium_intake_current_mg"), // Current day sodium intake in mg
  aiReflection: text("ai_reflection"),
  aiProcessed: boolean("ai_processed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  // Legacy fields for backward compatibility - will be populated from symptomEntries
  symptoms: text("symptoms").array(), // Deprecated: use symptomEntries instead
  intensity: integer("intensity"), // Deprecated: use individual symptomEntries intensities
}, (table) => ({
  userTimeIdx: index("symptom_logs_user_time_idx").on(table.userId, table.timestamp.desc()),
}));

// Individual symptom entries within a logging session
export const symptomEntries = pgTable("symptom_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symptomLogId: varchar("symptom_log_id").notNull().references(() => symptomLogs.id, { onDelete: 'cascade' }),
  symptomName: varchar("symptom_name").notNull(), // "Joint Pain", "Fatigue", etc.
  intensity: integer("intensity").notNull(), // 1-10 scale for this specific symptom
  notes: text("notes"), // Specific notes for this symptom
  createdAt: timestamp("created_at").defaultNow(),
});

// Water intake tracking
export const waterIntakeLogs = pgTable("water_intake_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  amountMl: integer("amount_ml").notNull(), // Amount in milliliters
  timestamp: timestamp("timestamp").notNull(),
  source: varchar("source").default("manual"), // "manual", "app_reminder", "integration"
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Sodium intake tracking
export const sodiumIntakeLogs = pgTable("sodium_intake_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  amountMg: integer("amount_mg").notNull(), // Amount in milligrams
  foodItem: varchar("food_item"), // What food/drink contained the sodium
  timestamp: timestamp("timestamp").notNull(),
  source: varchar("source").default("manual"), // "manual", "food_log", "integration"
  notes: text("notes"),
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
  feltUnderstood: boolean("felt_understood"), // User feedback on whether they felt understood
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
}, (table) => ({
  userTimeIdx: index("vitals_logs_user_time_idx").on(table.userId, table.timestamp.desc()),
}));

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
}, (table) => ({
  userBedtimeIdx: index("sleep_logs_user_bedtime_idx").on(table.userId, table.bedtime.desc()),
}));

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

// Shopping cart for marketplace
export const cartItems = pgTable("cart_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  productId: varchar("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

// Orders for completed purchases
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  stripeSessionId: varchar("stripe_session_id").unique(),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  status: varchar("status").notNull().default("pending"), // "pending", "completed", "failed", "refunded"
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency").notNull().default("usd"),
  shippingAddress: jsonb("shipping_address"), // Store as JSON for flexibility
  billingAddress: jsonb("billing_address"),
  orderDate: timestamp("order_date").defaultNow(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Individual items within an order
export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  productId: varchar("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Product reviews with EDS-specific feedback
export const productReviews = pgTable("product_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  productId: varchar("product_id").notNull().references(() => products.id),
  orderId: varchar("order_id").references(() => orders.id), // For verified purchase tracking
  
  // Overall rating
  overallRating: integer("overall_rating").notNull(), // 1-5 stars
  
  // EDS-specific ratings (1-5 scale)
  edsHelpfulness: integer("eds_helpfulness"), // How helpful is this for EDS symptoms?
  comfortRating: integer("comfort_rating"), // Daily use comfort for sensitive joints/skin
  durabilityRating: integer("durability_rating"), // Holds up to frequent EDS-related use
  symptomReliefRating: integer("symptom_relief_rating"), // Effectiveness for symptom management
  
  // Text feedback
  reviewTitle: varchar("review_title"),
  reviewText: text("review_text"),
  prosText: text("pros_text"), // What worked well
  consText: text("cons_text"), // What didn't work or could improve
  
  // EDS-specific feedback
  recommendToEdsPatients: boolean("recommend_to_eds_patients").default(false),
  specificEdsSymptoms: text("specific_eds_symptoms").array(), // Which EDS symptoms it helped with
  dailyUseContext: text("daily_use_context"), // How they use it in daily life
  
  // Verification and moderation
  verifiedPurchase: boolean("verified_purchase").default(false),
  isApproved: boolean("is_approved").default(false), // For moderation
  moderatorNotes: text("moderator_notes"),
  
  // Metadata
  helpfulCount: integer("helpful_count").default(0), // Users can mark reviews as helpful
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Track which users found reviews helpful
export const reviewHelpfulness = pgTable("review_helpfulness", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  reviewId: varchar("review_id").notNull().references(() => productReviews.id),
  isHelpful: boolean("is_helpful").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insights cache for performance optimization
export const insightsCache = pgTable("insights_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  rangeKey: varchar("range_key").notNull(), // "7d", "30d", "90d"
  payload: jsonb("payload").notNull(), // Cached insights data
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userRangeIdx: uniqueIndex("insights_cache_user_range_idx").on(table.userId, table.rangeKey),
}));

// Shared content - Main table for shareable health insights and progress
export const sharedContent = pgTable("shared_content", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  
  // Content metadata
  title: varchar("title").notNull(), // User-defined title for the share
  description: text("description"), // Optional description/context
  contentType: varchar("content_type").notNull(), // "symptom_trends", "health_summary", "ai_insights", "product_review", "achievement", "custom"
  
  // Content configuration
  dateRangeStart: timestamp("date_range_start"), // Start of data range being shared
  dateRangeEnd: timestamp("date_range_end"), // End of data range being shared
  dataSelections: jsonb("data_selections").notNull(), // What specific data to include
  
  // Generated content
  contentSnapshot: jsonb("content_snapshot").notNull(), // Pre-generated content for fast loading
  imageUrl: varchar("image_url"), // Generated visualization/chart URL if applicable
  
  // Sharing settings
  shareType: varchar("share_type").notNull().default("public"), // "public", "password_protected", "private"
  sharePassword: varchar("share_password"), // Hashed password for protected shares
  expiresAt: timestamp("expires_at"), // Optional expiration date
  allowComments: boolean("allow_comments").default(false),
  showAuthorInfo: boolean("show_author_info").default(true), // Whether to show user's name/info
  
  // Analytics
  viewCount: integer("view_count").default(0),
  lastViewedAt: timestamp("last_viewed_at"),
  
  // Status
  isActive: boolean("is_active").default(true),
  isReported: boolean("is_reported").default(false), // For community moderation
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userActiveIdx: index("shared_content_user_active_idx").on(table.userId, table.isActive),
  contentTypeIdx: index("shared_content_type_idx").on(table.contentType),
  expiresIdx: index("shared_content_expires_idx").on(table.expiresAt),
}));

// Share permissions and access tracking
export const sharePermissions = pgTable("share_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sharedContentId: varchar("shared_content_id").notNull().references(() => sharedContent.id, { onDelete: 'cascade' }),
  
  // Access control
  accessType: varchar("access_type").notNull(), // "anyone", "specific_users", "domain_restricted", "healthcare_provider"
  allowedUsers: text("allowed_users").array(), // Specific user IDs or emails if restricted
  allowedDomains: text("allowed_domains").array(), // Email domains if domain-restricted
  
  // Usage permissions
  allowDownload: boolean("allow_download").default(false),
  allowPrint: boolean("allow_print").default(true),
  allowShare: boolean("allow_share").default(false), // Whether viewers can reshare
  watermarkRequired: boolean("watermark_required").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Analytics for shared content engagement
export const shareAnalytics = pgTable("share_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sharedContentId: varchar("shared_content_id").notNull().references(() => sharedContent.id, { onDelete: 'cascade' }),
  
  // View tracking
  viewerIpHash: varchar("viewer_ip_hash"), // Hashed IP for anonymized analytics
  viewerUserId: varchar("viewer_user_id").references(() => users.id), // If viewer is logged in
  viewerUserAgent: text("viewer_user_agent"),
  
  // Engagement metrics
  viewDurationSeconds: integer("view_duration_seconds"),
  interactionType: varchar("interaction_type"), // "view", "download", "print", "comment", "share"
  referrerSource: varchar("referrer_source"), // "direct", "social_media", "email", "healthcare_portal"
  
  // Geographic data (anonymized)
  viewerCountry: varchar("viewer_country"),
  viewerRegion: varchar("viewer_region"),
  
  timestamp: timestamp("timestamp").defaultNow(),
}, (table) => ({
  contentTimeIdx: index("share_analytics_content_time_idx").on(table.sharedContentId, table.timestamp.desc()),
  interactionTypeIdx: index("share_analytics_interaction_idx").on(table.interactionType),
}));

// Community comments on shared content
export const shareComments = pgTable("share_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sharedContentId: varchar("shared_content_id").notNull().references(() => sharedContent.id, { onDelete: 'cascade' }),
  
  // Comment author (can be anonymous)
  authorUserId: varchar("author_user_id").references(() => users.id), // null for anonymous comments
  authorName: varchar("author_name"), // Display name (real or anonymous)
  authorEmail: varchar("author_email"), // For notifications, optional
  
  // Comment content
  commentText: text("comment_text").notNull(),
  isSupport: boolean("is_support").default(false), // Tagged as supportive/encouraging
  isQuestion: boolean("is_question").default(false), // Tagged as a question
  
  // Moderation
  isApproved: boolean("is_approved").default(false),
  isReported: boolean("is_reported").default(false),
  moderatorNotes: text("moderator_notes"),
  
  // Parent comment for threading (self-reference)
  parentCommentId: varchar("parent_comment_id"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  contentApprovedIdx: index("share_comments_content_approved_idx").on(table.sharedContentId, table.isApproved),
  parentIdx: index("share_comments_parent_idx").on(table.parentCommentId),
  // Add foreign key constraint separately to avoid circular reference issues
  parentCommentFk: table.parentCommentId.references(() => table.id),
}));

// Reminders system for medication, hydration, posture, and custom reminders
export const reminders = pgTable("reminders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: varchar("type").notNull(), // "medication", "hydration", "posture", "custom"
  label: varchar("label").notNull(), // User-friendly name for the reminder
  description: text("description"), // Optional detailed description
  
  // Scheduling configuration
  timeOfDay: varchar("time_of_day"), // "09:00", "14:30" - 24h format
  timezone: varchar("timezone").default("UTC"), // User's timezone
  cronExpression: varchar("cron_expression"), // For complex schedules
  frequency: varchar("frequency").default("daily"), // "daily", "weekly", "custom"
  weekDays: text("week_days").array(), // ["monday", "tuesday"] for weekly reminders
  
  // Delivery settings
  channelEmail: boolean("channel_email").default(true),
  channelInApp: boolean("channel_in_app").default(true),
  
  // State management
  isEnabled: boolean("is_enabled").default(true),
  isSnoozing: boolean("is_snoozing").default(false),
  snoozeUntil: timestamp("snooze_until"), // When snooze expires
  nextScheduledAt: timestamp("next_scheduled_at"), // Next firing time
  lastSentAt: timestamp("last_sent_at"), // Last successful send
  
  // Medication-specific fields
  medicationName: varchar("medication_name"), // For med reminders
  dosage: varchar("dosage"), // "2 tablets", "5mg"
  instructions: text("instructions"), // "Take with food"
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userEnabledIdx: index("reminders_user_enabled_idx").on(table.userId, table.isEnabled),
  nextScheduledIdx: index("reminders_next_scheduled_idx").on(table.nextScheduledAt),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  symptomLogs: many(symptomLogs),
  favorites: many(userFavorites),
  aiInteractions: many(aiInteractions),
  vitalsLogs: many(vitalsLogs),
  sleepLogs: many(sleepLogs),
  dataImportSources: many(dataImportSources),
  importConflicts: many(importConflicts),
  cartItems: many(cartItems),
  orders: many(orders),
  waterIntakeLogs: many(waterIntakeLogs),
  sodiumIntakeLogs: many(sodiumIntakeLogs),
  insightsCache: many(insightsCache),
  reminders: many(reminders),
}));

export const symptomLogsRelations = relations(symptomLogs, ({ one, many }) => ({
  user: one(users, {
    fields: [symptomLogs.userId],
    references: [users.id],
  }),
  aiInteractions: many(aiInteractions),
  symptomEntries: many(symptomEntries),
}));

export const symptomEntriesRelations = relations(symptomEntries, ({ one }) => ({
  symptomLog: one(symptomLogs, {
    fields: [symptomEntries.symptomLogId],
    references: [symptomLogs.id],
  }),
}));

export const waterIntakeLogsRelations = relations(waterIntakeLogs, ({ one }) => ({
  user: one(users, {
    fields: [waterIntakeLogs.userId],
    references: [users.id],
  }),
}));

export const sodiumIntakeLogsRelations = relations(sodiumIntakeLogs, ({ one }) => ({
  user: one(users, {
    fields: [sodiumIntakeLogs.userId],
    references: [users.id],
  }),
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

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  user: one(users, {
    fields: [cartItems.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [cartItems.productId],
    references: [products.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  orderItems: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const insightsCacheRelations = relations(insightsCache, ({ one }) => ({
  user: one(users, {
    fields: [insightsCache.userId],
    references: [users.id],
  }),
}));

export const remindersRelations = relations(reminders, ({ one }) => ({
  user: one(users, {
    fields: [reminders.userId],
    references: [users.id],
  }),
}));

// Schema types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Enhanced symptom logging schemas
export const insertSymptomLogSchema = createInsertSchema(symptomLogs).omit({
  id: true,
  createdAt: true,
  aiReflection: true,
  aiProcessed: true,
  symptoms: true, // Legacy field
  intensity: true, // Legacy field
}).extend({
  timestamp: z.string().datetime().transform((str) => new Date(str))
});
export type InsertSymptomLog = z.infer<typeof insertSymptomLogSchema>;
export type SymptomLog = typeof symptomLogs.$inferSelect;

export const insertSymptomEntrySchema = createInsertSchema(symptomEntries).omit({
  id: true,
  createdAt: true,
});
export type InsertSymptomEntry = z.infer<typeof insertSymptomEntrySchema>;
export type SymptomEntry = typeof symptomEntries.$inferSelect;

// Water intake schemas
export const insertWaterIntakeLogSchema = createInsertSchema(waterIntakeLogs).omit({
  id: true,
  createdAt: true,
}).extend({
  timestamp: z.string().datetime().transform((str) => new Date(str))
});
export type InsertWaterIntakeLog = z.infer<typeof insertWaterIntakeLogSchema>;
export type WaterIntakeLog = typeof waterIntakeLogs.$inferSelect;

// Sodium intake schemas
export const insertSodiumIntakeLogSchema = createInsertSchema(sodiumIntakeLogs).omit({
  id: true,
  createdAt: true,
}).extend({
  timestamp: z.string().datetime().transform((str) => new Date(str))
});
export type InsertSodiumIntakeLog = z.infer<typeof insertSodiumIntakeLogSchema>;
export type SodiumIntakeLog = typeof sodiumIntakeLogs.$inferSelect;

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

// Reminders schemas
export const insertReminderSchema = createInsertSchema(reminders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  nextScheduledAt: true,
  lastSentAt: true,
});
export type InsertReminder = z.infer<typeof insertReminderSchema>;
export type Reminder = typeof reminders.$inferSelect;

// Cart and Order types
export const insertCartItemSchema = createInsertSchema(cartItems).omit({
  id: true,
  createdAt: true,
});
export type InsertCartItem = z.infer<typeof insertCartItemSchema>;
export type CartItem = typeof cartItems.$inferSelect;

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  orderDate: true,
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({
  id: true,
  createdAt: true,
});
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;

// Product review types
export const insertProductReviewSchema = createInsertSchema(productReviews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  helpfulCount: true,
  verifiedPurchase: true,
  isApproved: true,
  moderatorNotes: true,
});
export type InsertProductReview = z.infer<typeof insertProductReviewSchema>;
export type ProductReview = typeof productReviews.$inferSelect;

export const insertReviewHelpfulnessSchema = createInsertSchema(reviewHelpfulness).omit({
  id: true,
  createdAt: true,
});
export type InsertReviewHelpfulness = z.infer<typeof insertReviewHelpfulnessSchema>;
export type ReviewHelpfulness = typeof reviewHelpfulness.$inferSelect;

// Insights cache types
export const insertInsightsCacheSchema = createInsertSchema(insightsCache).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertInsightsCache = z.infer<typeof insertInsightsCacheSchema>;
export type InsightsCache = typeof insightsCache.$inferSelect;

// Sharing types
export const insertSharedContentSchema = createInsertSchema(sharedContent).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  viewCount: true,
  lastViewedAt: true,
}).extend({
  dateRangeStart: z.string().datetime().optional().transform((str) => str ? new Date(str) : undefined),
  dateRangeEnd: z.string().datetime().optional().transform((str) => str ? new Date(str) : undefined),
  expiresAt: z.string().datetime().optional().transform((str) => str ? new Date(str) : undefined),
});
export type InsertSharedContent = z.infer<typeof insertSharedContentSchema>;
export type SharedContent = typeof sharedContent.$inferSelect;

export const insertSharePermissionsSchema = createInsertSchema(sharePermissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSharePermissions = z.infer<typeof insertSharePermissionsSchema>;
export type SharePermissions = typeof sharePermissions.$inferSelect;

export const insertShareAnalyticsSchema = createInsertSchema(shareAnalytics).omit({
  id: true,
  timestamp: true,
});
export type InsertShareAnalytics = z.infer<typeof insertShareAnalyticsSchema>;
export type ShareAnalytics = typeof shareAnalytics.$inferSelect;

export const insertShareCommentsSchema = createInsertSchema(shareComments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isApproved: true,
  isReported: true,
  moderatorNotes: true,
});
export type InsertShareComments = z.infer<typeof insertShareCommentsSchema>;
export type ShareComments = typeof shareComments.$inferSelect;
