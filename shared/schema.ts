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
  
  // Wave 2 - Groups access control fields
  birthYear: integer("birth_year"), // For age-based group access (e.g., 1995)
  gender: varchar("gender"), // "woman", "man", "non-binary", "prefer_not_to_say", etc.
  identity: text("identity").array(), // ["LGBTQ+", "transgender", "non-binary", etc.]
  
  // Data retention settings (in months, -1 for keep forever)
  symptomLogsRetentionMonths: integer("symptom_logs_retention_months").default(36), // Default 3 years
  vitalsLogsRetentionMonths: integer("vitals_logs_retention_months").default(36), // Default 3 years
  sleepLogsRetentionMonths: integer("sleep_logs_retention_months").default(36), // Default 3 years
  aiInteractionsRetentionMonths: integer("ai_interactions_retention_months").default(24), // Default 2 years
  
  // Account deletion (soft delete with 7-day recovery)
  deletedAt: timestamp("deleted_at"), // null = active, timestamp = soft deleted
  deleteToken: varchar("delete_token").unique(), // UUID token for undo link
  deletionReason: text("deletion_reason"), // Optional reason for deletion
  
  // Wave 2 - Referrals
  referralCode: varchar("referral_code").unique(), // Unique referral code for inviting others
  
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
  weatherTemp: decimal("weather_temp", { precision: 5, scale: 2 }), // Temperature in Celsius (legacy)
  weatherCondition: varchar("weather_condition"), // "sunny", "rainy", "cloudy", etc. (legacy)
  weatherLocation: varchar("weather_location"), // City/location for weather data (legacy)
  // Enhanced weather data (Wave 1 - FF_WEATHER)
  weatherTempC: decimal("weather_temp_c", { precision: 5, scale: 2 }), // Temperature in Celsius (accurate)
  weatherText: text("weather_text"), // Detailed weather condition text
  weatherObservedAt: timestamp("weather_observed_at", { withTimezone: true }), // When weather was captured
  lat: decimal("lat", { precision: 10, scale: 7 }), // Latitude where logged
  lon: decimal("lon", { precision: 10, scale: 7 }), // Longitude where logged
  weatherSource: varchar("weather_source"), // Source: 'open-meteo', 'openweather', etc.
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

// Individual symptom entries - now independent with precise timestamps (Wave 3 - Multi-Entry)
export const symptomEntries = pgTable("symptom_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id), // Denormalized for direct queries
  symptomLogId: varchar("symptom_log_id").notNull().references(() => symptomLogs.id, { onDelete: 'cascade' }), // Legacy parent log
  symptomName: varchar("symptom_name").notNull(), // "Joint Pain", "Fatigue", etc.
  intensity: integer("intensity").notNull(), // 1-10 scale for this specific symptom
  notes: text("notes"), // Specific notes for this symptom
  // Wave 1C - Body-part specific tracking (FF_BODY_PARTS)
  bodyPart: varchar("body_part"), // "neck", "shoulder_left", "knee_right", "back_upper", "jaw", "abdomen", etc.
  side: varchar("side"), // "left", "right", "bilateral", null for non-paired parts
  // Wave 3 - Multi-Entry: precise timestamp when symptom occurred (allows multiple entries per day)
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  // Wave 3 - Per-entry weather data
  weatherTempC: decimal("weather_temp_c", { precision: 5, scale: 2 }), // Temperature in Celsius
  weatherText: text("weather_text"), // Detailed weather condition text
  weatherObservedAt: timestamp("weather_observed_at", { withTimezone: true }), // When weather was captured
  lat: decimal("lat", { precision: 10, scale: 7 }), // Latitude where logged
  lon: decimal("lon", { precision: 10, scale: 7 }), // Longitude where logged
  weatherSource: varchar("weather_source"), // Source: 'open-meteo', 'openweather', etc.
  // Wave 3 - Per-entry vitals/context
  waterIntakeCurrentMl: integer("water_intake_current_ml"), // Current day water intake in ml
  heartRateBpm: integer("heart_rate_bpm"), // Heart rate at time of logging
  sodiumIntakeCurrentMg: integer("sodium_intake_current_mg"), // Current day sodium intake in mg
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userOccurredIdx: index("idx_symptom_entries_user_occurred").on(table.userId, table.occurredAt.desc()),
}));

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
}));

// ============ GROUPS/ROOMS SOCIAL FEATURE ============

// Groups/Rooms - Main table for community groups
export const groups = pgTable("groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug").notNull().unique(), // URL-friendly identifier
  name: varchar("name").notNull(),
  visibility: varchar("visibility").notNull().default("private"), // "private" | "public"
  kind: varchar("kind").notNull(), // "age" | "diagnosis" | "topic"
  description: text("description"),
  rules: text("rules"), // Community guidelines for this group
  coverImageUrl: varchar("cover_image_url"),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  memberCount: integer("member_count").default(0), // Denormalized for performance
  postCount: integer("post_count").default(0), // Denormalized for performance
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  kindVisibilityIdx: index("groups_kind_visibility_idx").on(table.kind, table.visibility),
  slugIdx: index("groups_slug_idx").on(table.slug),
}));

// Group tags for categorization and discovery
export const groupTags = pgTable("group_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull().references(() => groups.id, { onDelete: 'cascade' }),
  tag: varchar("tag").notNull(), // "POTS", "EDS Type III", "Hypermobility", etc.
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  groupTagIdx: index("group_tags_group_idx").on(table.groupId),
  tagIdx: index("group_tags_tag_idx").on(table.tag),
}));

// Group membership and roles
export const groupMemberships = pgTable("group_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull().references(() => groups.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar("role").notNull().default("member"), // "member" | "moderator" | "owner"
  joinStatus: varchar("join_status").notNull().default("pending"), // "approved" | "pending" | "banned"
  pseudonym: varchar("pseudonym"), // Optional group-specific nickname
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userGroupIdx: uniqueIndex("group_memberships_user_group_idx").on(table.userId, table.groupId),
  groupStatusIdx: index("group_memberships_group_status_idx").on(table.groupId, table.joinStatus),
}));

// Posts in groups
export const posts = pgTable("posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull().references(() => groups.id, { onDelete: 'cascade' }),
  authorId: varchar("author_id").notNull().references(() => users.id),
  body: text("body").notNull(), // Markdown subset
  kind: varchar("kind").notNull().default("text"), // "text" | "poll" | "resource"
  mediaUrl: varchar("media_url"), // Optional image/attachment
  isPinned: boolean("is_pinned").default(false),
  isRemoved: boolean("is_removed").default(false), // Soft delete for moderation
  reactionCount: integer("reaction_count").default(0), // Denormalized
  commentCount: integer("comment_count").default(0), // Denormalized
  createdAt: timestamp("created_at").defaultNow(),
  editedAt: timestamp("edited_at"),
}, (table) => ({
  groupCreatedIdx: index("posts_group_created_idx").on(table.groupId, table.createdAt.desc()),
  groupPinnedIdx: index("posts_group_pinned_idx").on(table.groupId, table.isPinned),
  authorIdx: index("posts_author_idx").on(table.authorId),
}));

// Poll associated with posts
export const postPolls = pgTable("post_polls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull().references(() => posts.id, { onDelete: 'cascade' }).unique(),
  question: text("question").notNull(),
  closesAt: timestamp("closes_at"), // Optional poll close date
  totalVotes: integer("total_votes").default(0), // Denormalized
  createdAt: timestamp("created_at").defaultNow(),
});

// Poll options
export const postPollOptions = pgTable("post_poll_options", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull().references(() => posts.id, { onDelete: 'cascade' }),
  optionText: varchar("option_text").notNull(),
  votes: integer("votes").default(0), // Denormalized vote count
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  postIdx: index("post_poll_options_post_idx").on(table.postId),
}));

// Poll votes (to track who voted)
export const postPollVotes = pgTable("post_poll_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull().references(() => posts.id, { onDelete: 'cascade' }),
  optionId: varchar("option_id").notNull().references(() => postPollOptions.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userPostIdx: uniqueIndex("post_poll_votes_user_post_idx").on(table.userId, table.postId),
}));

// Comments on posts
export const groupComments = pgTable("group_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull().references(() => posts.id, { onDelete: 'cascade' }),
  authorId: varchar("author_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  parentCommentId: varchar("parent_comment_id"), // For threading (max depth 2)
  isRemoved: boolean("is_removed").default(false), // Soft delete for moderation
  createdAt: timestamp("created_at").defaultNow(),
  editedAt: timestamp("edited_at"),
}, (table) => ({
  postCreatedIdx: index("group_comments_post_created_idx").on(table.postId, table.createdAt.desc()),
  parentIdx: index("group_comments_parent_idx").on(table.parentCommentId),
}));

// Reactions (emoji) on posts
export const reactions = pgTable("reactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  emoji: varchar("emoji").notNull(), // "❤️" | "👍" | "🙏" | "💪" | "🎉"
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  postEmojiIdx: index("reactions_post_emoji_idx").on(table.postId, table.emoji),
  userPostEmojiIdx: uniqueIndex("reactions_user_post_emoji_idx").on(table.userId, table.postId, table.emoji),
}));

// Reports for content moderation
export const groupReports = pgTable("group_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull().references(() => groups.id, { onDelete: 'cascade' }),
  targetType: varchar("target_type").notNull(), // "post" | "comment" | "user"
  targetId: varchar("target_id").notNull(), // ID of the reported item
  reporterId: varchar("reporter_id").notNull().references(() => users.id),
  reasonCode: varchar("reason_code").notNull(), // "spam" | "harassment" | "medical_advice" | "other"
  notes: text("notes"), // Additional context from reporter
  status: varchar("status").notNull().default("open"), // "open" | "reviewed" | "actioned" | "dismissed"
  moderatorId: varchar("moderator_id").references(() => users.id), // Who handled it
  moderatorAction: varchar("moderator_action"), // "removed" | "muted" | "banned" | "no_action"
  moderatorNotes: text("moderator_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => ({
  groupIdIdx: index("group_reports_group_idx").on(table.groupId),
  targetTypeIdx: index("group_reports_target_idx").on(table.targetType, table.targetId),
  statusIdx: index("group_reports_status_idx").on(table.status),
}));

// Bans/mutes for users in groups
export const groupBans = pgTable("group_bans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").references(() => groups.id, { onDelete: 'cascade' }), // null for platform-wide ban
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  reason: text("reason").notNull(),
  bannedBy: varchar("banned_by").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at"), // null for permanent ban
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userGroupIdx: index("group_bans_user_group_idx").on(table.userId, table.groupId),
}));

// Notifications for group activity
export const groupNotifications = pgTable("group_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  groupId: varchar("group_id").references(() => groups.id, { onDelete: 'cascade' }),
  type: varchar("type").notNull(), // "new_post" | "comment_reply" | "poll_closed" | "mention" | "join_approved"
  actorId: varchar("actor_id").references(() => users.id), // Who triggered the notification
  targetType: varchar("target_type"), // "post" | "comment" | "poll"
  targetId: varchar("target_id"), // ID of related content
  message: text("message").notNull(), // Generic message text
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userReadIdx: index("group_notifications_user_read_idx").on(table.userId, table.isRead),
  createdIdx: index("group_notifications_created_idx").on(table.createdAt.desc()),
}));

// ============ END GROUPS/ROOMS SOCIAL FEATURE ============

// ============ REFERRALS & REWARDS SYSTEM ============

// Referral events - track when users refer others and when referred users become active
export const referralEvents = pgTable("referral_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerUserId: varchar("referrer_user_id").notNull().references(() => users.id, { onDelete: 'cascade' }), // Who referred
  referredUserId: varchar("referred_user_id").notNull().references(() => users.id, { onDelete: 'cascade' }), // Who was referred
  eventType: varchar("event_type").notNull(), // "signup" | "week_active"
  occurredAt: timestamp("occurred_at").defaultNow(),
}, (table) => ({
  referrerIdx: index("referral_events_referrer_idx").on(table.referrerUserId),
  referredIdx: index("referral_events_referred_idx").on(table.referredUserId),
  typeIdx: index("referral_events_type_idx").on(table.eventType),
}));

// Rewards ledger - track points earned by users for various actions
export const rewardsLedger = pgTable("rewards_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  points: integer("points").notNull(), // Positive for earned, negative for spent
  reason: varchar("reason").notNull(), // "invite_confirmed" | "active_week" | "referral_bonus" | "streak_bonus"
  referenceId: varchar("reference_id"), // ID of related event (referral_event_id, etc.)
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userCreatedIdx: index("rewards_ledger_user_created_idx").on(table.userId, table.createdAt.desc()),
  reasonIdx: index("rewards_ledger_reason_idx").on(table.reason),
}));

// ============ END REFERRALS & REWARDS SYSTEM ============

// ============ PERSONAL CIRCLE (PRIVATE SHARING) ============

// Personal Circle - owner can invite trusted people to view scoped health data
export const circles = pgTable("circles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: 'cascade' }).unique(), // 1 circle per owner
  name: varchar("name").notNull().default("My Circle"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  ownerIdx: index("circles_owner_idx").on(table.ownerId),
}));

// Circle members - invited people with read-only access
export const circleMembers = pgTable("circle_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  circleId: varchar("circle_id").notNull().references(() => circles.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }), // null until invite accepted
  email: varchar("email").notNull(), // invite target email
  role: varchar("role").notNull().default("member"), // "member" | "guardian"
  status: varchar("status").notNull().default("pending"), // "pending" | "active" | "revoked"
  pseudonym: varchar("pseudonym"), // owner-visible label like "Mom"
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  circleIdIdx: index("circle_members_circle_idx").on(table.circleId),
  userIdIdx: index("circle_members_user_idx").on(table.userId),
  circleEmailUnique: uniqueIndex("circle_members_circle_email_unique").on(table.circleId, table.email),
}));

// Circle sharing scope - what data owner shares and how much detail
export const circleScopes = pgTable("circle_scopes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  circleId: varchar("circle_id").notNull().references(() => circles.id, { onDelete: 'cascade' }).unique(),
  // granular sharing choices
  shareSymptoms: boolean("share_symptoms").default(true),
  shareVitals: boolean("share_vitals").default(true),
  shareSleep: boolean("share_sleep").default(false),
  shareHydration: boolean("share_hydration").default(false),
  shareAIReflections: boolean("share_ai_reflections").default(false),
  // how much detail
  detailLevel: varchar("detail_level").notNull().default("summary"), // "summary" | "detail"
  // time window of shared history
  daysBack: integer("days_back").notNull().default(30), // e.g., last 30/90 days
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  circleIdIdx: index("circle_scopes_circle_idx").on(table.circleId),
}));

// Circle alert rules - automated reach out when thresholds crossed
export const circleAlertRules = pgTable("circle_alert_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  circleId: varchar("circle_id").notNull().references(() => circles.id, { onDelete: 'cascade' }).unique(),
  // trigger config
  active: boolean("active").default(false),
  quietStart: varchar("quiet_start"), // "22:00" local time
  quietEnd: varchar("quiet_end"), // "07:00" local time
  cooldownMin: integer("cooldown_min").notNull().default(180), // minimum minutes between alerts
  // example triggers (extendable)
  flareThreshold: integer("flare_threshold"), // e.g., pain >= 8/10
  hrDeltaBpm: integer("hr_delta_bpm"), // standing - supine >= N
  lowSleepHours: decimal("low_sleep_hours", { precision: 4, scale: 2 }), // last-night sleep < N
  // channel preferences
  channelEmail: boolean("channel_email").default(true),
  channelSMS: boolean("channel_sms").default(false),
  notifyGuardianFirst: boolean("notify_guardian_first").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  circleIdIdx: index("circle_alert_rules_circle_idx").on(table.circleId),
}));

// Circle alert log - audit trail of all alerts sent
export const circleAlertLogs = pgTable("circle_alert_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  circleId: varchar("circle_id").notNull().references(() => circles.id, { onDelete: 'cascade' }),
  ruleId: varchar("rule_id").references(() => circleAlertRules.id, { onDelete: 'set null' }),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  channel: varchar("channel").notNull(), // "email" | "sms" | "inapp"
  toMemberId: varchar("to_member_id").references(() => circleMembers.id, { onDelete: 'set null' }),
  summary: text("summary").notNull(), // short, non-PHI subject/line
  payloadHash: varchar("payload_hash").notNull(), // hash of content for audit
}, (table) => ({
  circleIdIdx: index("circle_alert_logs_circle_idx").on(table.circleId),
  sentAtIdx: index("circle_alert_logs_sent_at_idx").on(table.sentAt.desc()),
}));

// Circle invite tokens - secure tokens for accepting invites
export const circleInviteTokens = pgTable("circle_invite_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  circleId: varchar("circle_id").notNull().references(() => circles.id, { onDelete: 'cascade' }),
  email: varchar("email").notNull(),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  circleIdIdx: index("circle_invite_tokens_circle_idx").on(table.circleId),
  tokenIdx: uniqueIndex("circle_invite_tokens_token_idx").on(table.token),
}));

// Pending circle alerts - alerts waiting for cancel window
export const circlePendingAlerts = pgTable("circle_pending_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  circleId: varchar("circle_id").notNull().references(() => circles.id, { onDelete: 'cascade' }),
  ruleId: varchar("rule_id").references(() => circleAlertRules.id, { onDelete: 'set null' }),
  triggerReason: text("trigger_reason").notNull(), // what caused this alert
  scheduledFor: timestamp("scheduled_for").notNull(), // when to send (after cancel window)
  canceledAt: timestamp("canceled_at"), // if owner cancels
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  circleIdIdx: index("circle_pending_alerts_circle_idx").on(table.circleId),
  scheduledIdx: index("circle_pending_alerts_scheduled_idx").on(table.scheduledFor),
}));

// ============ END PERSONAL CIRCLE ============

// Wave 3+ - Herd Alerts: Manual reach-out system for notifying herd members
export const herdAlerts = pgTable("herd_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  recipientUserId: varchar("recipient_user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: varchar("status").notNull(), // "pending", "sent", "canceled"
  message: text("message"), // Optional user message
  cancelToken: varchar("cancel_token").unique(), // Unique token for canceling
  createdAt: timestamp("created_at").notNull().defaultNow(),
  windowExpiresAt: timestamp("window_expires_at").notNull(), // When cancel window expires
  sentAt: timestamp("sent_at"), // When alert was sent
  canceledAt: timestamp("canceled_at"), // When user canceled
}, (table) => ({
  recipientStatusIdx: index("herd_alerts_recipient_status_idx").on(table.recipientUserId, table.status),
  userCreatedIdx: index("herd_alerts_user_created_idx").on(table.userId, table.createdAt.desc()),
  pendingExpiredIdx: index("herd_alerts_pending_expired_idx").on(table.status, table.windowExpiresAt),
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

// Push notification devices for Capacitor mobile apps
export const devices = pgTable("devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  deviceToken: varchar("device_token").notNull(), // APNs or FCM token
  platform: varchar("platform").notNull(), // "ios" or "android"
  deviceInfo: text("device_info"), // Optional JSON string with device metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("devices_user_idx").on(table.userId),
  tokenIdx: uniqueIndex("devices_token_idx").on(table.deviceToken),
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
  groupMemberships: many(groupMemberships),
  createdGroups: many(groups),
  posts: many(posts),
  groupComments: many(groupComments),
  reactions: many(reactions),
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

// Groups relations
export const groupsRelations = relations(groups, ({ one, many }) => ({
  creator: one(users, {
    fields: [groups.createdBy],
    references: [users.id],
  }),
  memberships: many(groupMemberships),
  tags: many(groupTags),
  posts: many(posts),
}));

export const groupTagsRelations = relations(groupTags, ({ one }) => ({
  group: one(groups, {
    fields: [groupTags.groupId],
    references: [groups.id],
  }),
}));

export const groupMembershipsRelations = relations(groupMemberships, ({ one }) => ({
  group: one(groups, {
    fields: [groupMemberships.groupId],
    references: [groups.id],
  }),
  user: one(users, {
    fields: [groupMemberships.userId],
    references: [users.id],
  }),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  group: one(groups, {
    fields: [posts.groupId],
    references: [groups.id],
  }),
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
  poll: one(postPolls, {
    fields: [posts.id],
    references: [postPolls.postId],
  }),
  comments: many(groupComments),
  reactions: many(reactions),
}));

export const postPollsRelations = relations(postPolls, ({ one, many }) => ({
  post: one(posts, {
    fields: [postPolls.postId],
    references: [posts.id],
  }),
  options: many(postPollOptions),
}));

export const postPollOptionsRelations = relations(postPollOptions, ({ one, many }) => ({
  post: one(posts, {
    fields: [postPollOptions.postId],
    references: [posts.id],
  }),
  votes: many(postPollVotes),
}));

export const postPollVotesRelations = relations(postPollVotes, ({ one }) => ({
  post: one(posts, {
    fields: [postPollVotes.postId],
    references: [posts.id],
  }),
  option: one(postPollOptions, {
    fields: [postPollVotes.optionId],
    references: [postPollOptions.id],
  }),
  user: one(users, {
    fields: [postPollVotes.userId],
    references: [users.id],
  }),
}));

export const groupCommentsRelations = relations(groupComments, ({ one }) => ({
  post: one(posts, {
    fields: [groupComments.postId],
    references: [posts.id],
  }),
  author: one(users, {
    fields: [groupComments.authorId],
    references: [users.id],
  }),
}));

export const reactionsRelations = relations(reactions, ({ one }) => ({
  post: one(posts, {
    fields: [reactions.postId],
    references: [posts.id],
  }),
  user: one(users, {
    fields: [reactions.userId],
    references: [users.id],
  }),
}));

export const groupReportsRelations = relations(groupReports, ({ one }) => ({
  reporter: one(users, {
    fields: [groupReports.reporterId],
    references: [users.id],
  }),
}));

export const groupBansRelations = relations(groupBans, ({ one }) => ({
  group: one(groups, {
    fields: [groupBans.groupId],
    references: [groups.id],
  }),
  user: one(users, {
    fields: [groupBans.userId],
    references: [users.id],
  }),
  bannedByUser: one(users, {
    fields: [groupBans.bannedBy],
    references: [users.id],
  }),
}));

export const groupNotificationsRelations = relations(groupNotifications, ({ one }) => ({
  user: one(users, {
    fields: [groupNotifications.userId],
    references: [users.id],
  }),
  group: one(groups, {
    fields: [groupNotifications.groupId],
    references: [groups.id],
  }),
  actor: one(users, {
    fields: [groupNotifications.actorId],
    references: [users.id],
  }),
}));

// Circle relations
export const circlesRelations = relations(circles, ({ one, many }) => ({
  owner: one(users, {
    fields: [circles.ownerId],
    references: [users.id],
  }),
  members: many(circleMembers),
  scope: one(circleScopes),
  alertRule: one(circleAlertRules),
}));

export const circleMembersRelations = relations(circleMembers, ({ one }) => ({
  circle: one(circles, {
    fields: [circleMembers.circleId],
    references: [circles.id],
  }),
  user: one(users, {
    fields: [circleMembers.userId],
    references: [users.id],
  }),
}));

export const circleScopesRelations = relations(circleScopes, ({ one }) => ({
  circle: one(circles, {
    fields: [circleScopes.circleId],
    references: [circles.id],
  }),
}));

export const circleAlertRulesRelations = relations(circleAlertRules, ({ one }) => ({
  circle: one(circles, {
    fields: [circleAlertRules.circleId],
    references: [circles.id],
  }),
}));

export const circleAlertLogsRelations = relations(circleAlertLogs, ({ one }) => ({
  circle: one(circles, {
    fields: [circleAlertLogs.circleId],
    references: [circles.id],
  }),
  member: one(circleMembers, {
    fields: [circleAlertLogs.toMemberId],
    references: [circleMembers.id],
  }),
}));

export const circleInviteTokensRelations = relations(circleInviteTokens, ({ one }) => ({
  circle: one(circles, {
    fields: [circleInviteTokens.circleId],
    references: [circles.id],
  }),
}));

export const circlePendingAlertsRelations = relations(circlePendingAlerts, ({ one }) => ({
  circle: one(circles, {
    fields: [circlePendingAlerts.circleId],
    references: [circles.id],
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
  userId: true, // Set from auth context
  createdAt: true,
}).extend({
  occurredAt: z.string().datetime().transform((str) => new Date(str)).optional(), // Defaults to now() if not provided
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

// Groups types
export const insertGroupSchema = createInsertSchema(groups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  memberCount: true,
  postCount: true,
});
export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type Group = typeof groups.$inferSelect;

export const insertGroupTagSchema = createInsertSchema(groupTags).omit({
  id: true,
  createdAt: true,
});
export type InsertGroupTag = z.infer<typeof insertGroupTagSchema>;
export type GroupTag = typeof groupTags.$inferSelect;

export const insertGroupMembershipSchema = createInsertSchema(groupMemberships).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGroupMembership = z.infer<typeof insertGroupMembershipSchema>;
export type GroupMembership = typeof groupMemberships.$inferSelect;

export const insertPostSchema = createInsertSchema(posts).omit({
  id: true,
  createdAt: true,
  reactionCount: true,
  commentCount: true,
});
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof posts.$inferSelect;

export const insertPostPollSchema = createInsertSchema(postPolls).omit({
  id: true,
  createdAt: true,
  totalVotes: true,
}).extend({
  closesAt: z.string().datetime().optional().transform((str) => str ? new Date(str) : undefined),
});
export type InsertPostPoll = z.infer<typeof insertPostPollSchema>;
export type PostPoll = typeof postPolls.$inferSelect;

export const insertPostPollOptionSchema = createInsertSchema(postPollOptions).omit({
  id: true,
  createdAt: true,
  votes: true,
});
export type InsertPostPollOption = z.infer<typeof insertPostPollOptionSchema>;
export type PostPollOption = typeof postPollOptions.$inferSelect;

export const insertPostPollVoteSchema = createInsertSchema(postPollVotes).omit({
  id: true,
  createdAt: true,
});
export type InsertPostPollVote = z.infer<typeof insertPostPollVoteSchema>;
export type PostPollVote = typeof postPollVotes.$inferSelect;

export const insertGroupCommentSchema = createInsertSchema(groupComments).omit({
  id: true,
  authorId: true,
  isRemoved: true,
  createdAt: true,
  editedAt: true,
});
export type InsertGroupComment = z.infer<typeof insertGroupCommentSchema>;
export type GroupComment = typeof groupComments.$inferSelect;

export const insertReactionSchema = createInsertSchema(reactions).omit({
  id: true,
  createdAt: true,
});
export type InsertReaction = z.infer<typeof insertReactionSchema>;
export type Reaction = typeof reactions.$inferSelect;

export const insertGroupReportSchema = createInsertSchema(groupReports).omit({
  id: true,
  createdAt: true,
  moderatorId: true,
  moderatorAction: true,
  moderatorNotes: true,
  resolvedAt: true,
});
export type InsertGroupReport = z.infer<typeof insertGroupReportSchema>;
export type GroupReport = typeof groupReports.$inferSelect;

export const insertGroupBanSchema = createInsertSchema(groupBans).omit({
  id: true,
  createdAt: true,
}).extend({
  expiresAt: z.string().datetime().optional().transform((str) => str ? new Date(str) : undefined),
});
export type InsertGroupBan = z.infer<typeof insertGroupBanSchema>;
export type GroupBan = typeof groupBans.$inferSelect;

export const insertGroupNotificationSchema = createInsertSchema(groupNotifications).omit({
  id: true,
  createdAt: true,
  isRead: true,
});
export type InsertGroupNotification = z.infer<typeof insertGroupNotificationSchema>;
export type GroupNotification = typeof groupNotifications.$inferSelect;

// Circle schemas
export const insertCircleSchema = createInsertSchema(circles).omit({
  id: true,
  createdAt: true,
});
export type InsertCircle = z.infer<typeof insertCircleSchema>;
export type Circle = typeof circles.$inferSelect;

export const insertCircleMemberSchema = createInsertSchema(circleMembers).omit({
  id: true,
  createdAt: true,
});
export type InsertCircleMember = z.infer<typeof insertCircleMemberSchema>;
export type CircleMember = typeof circleMembers.$inferSelect;

export const insertCircleScopeSchema = createInsertSchema(circleScopes).omit({
  id: true,
  updatedAt: true,
});
export type InsertCircleScope = z.infer<typeof insertCircleScopeSchema>;
export type CircleScope = typeof circleScopes.$inferSelect;

export const insertCircleAlertRuleSchema = createInsertSchema(circleAlertRules).omit({
  id: true,
  createdAt: true,
});
export type InsertCircleAlertRule = z.infer<typeof insertCircleAlertRuleSchema>;
export type CircleAlertRule = typeof circleAlertRules.$inferSelect;

export const insertCircleAlertLogSchema = createInsertSchema(circleAlertLogs).omit({
  id: true,
  sentAt: true,
});
export type InsertCircleAlertLog = z.infer<typeof insertCircleAlertLogSchema>;
export type CircleAlertLog = typeof circleAlertLogs.$inferSelect;

export const insertCircleInviteTokenSchema = createInsertSchema(circleInviteTokens).omit({
  id: true,
  createdAt: true,
}).extend({
  expiresAt: z.string().datetime().transform((str) => new Date(str)),
});
export type InsertCircleInviteToken = z.infer<typeof insertCircleInviteTokenSchema>;
export type CircleInviteToken = typeof circleInviteTokens.$inferSelect;

export const insertCirclePendingAlertSchema = createInsertSchema(circlePendingAlerts).omit({
  id: true,
  createdAt: true,
}).extend({
  scheduledFor: z.string().datetime().transform((str) => new Date(str)),
});
export type InsertCirclePendingAlert = z.infer<typeof insertCirclePendingAlertSchema>;
export type CirclePendingAlert = typeof circlePendingAlerts.$inferSelect;

// Herd Alerts schemas (Wave 3+)
export const insertHerdAlertSchema = createInsertSchema(herdAlerts).omit({
  id: true,
  createdAt: true,
  sentAt: true,
  canceledAt: true,
});
export type InsertHerdAlert = z.infer<typeof insertHerdAlertSchema>;
export type HerdAlert = typeof herdAlerts.$inferSelect;

// Referrals & Rewards schemas
export const insertReferralEventSchema = createInsertSchema(referralEvents).omit({
  id: true,
  occurredAt: true,
});
export type InsertReferralEvent = z.infer<typeof insertReferralEventSchema>;
export type ReferralEvent = typeof referralEvents.$inferSelect;

export const insertRewardsLedgerSchema = createInsertSchema(rewardsLedger).omit({
  id: true,
  createdAt: true,
});
export type InsertRewardsLedger = z.infer<typeof insertRewardsLedgerSchema>;
export type RewardsLedger = typeof rewardsLedger.$inferSelect;

export const insertDeviceSchema = createInsertSchema(devices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Device = typeof devices.$inferSelect;

// RAG (Retrieval-Augmented Generation) tables for EDS AI Brain
export const knowledgeChunks = pgTable("knowledge_chunks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  source: varchar("source").notNull(), // "eds-manual", "pots-guide", "clinic-handout", etc.
  title: varchar("title").notNull(), // Short descriptive title
  content: text("content").notNull(), // The actual knowledge text
  embedding: jsonb("embedding"), // Vector embedding as JSON array [0.1, 0.2, ...]
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  sourceIdx: index("knowledge_chunks_source_idx").on(table.source),
}));

export const userChunks = pgTable("user_chunks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: varchar("kind").notNull(), // "symptom" | "trend" | "summary"
  content: text("content").notNull(), // Summary or aggregated text
  embedding: jsonb("embedding"), // Vector embedding as JSON array
  occurredAt: timestamp("occurred_at", { withTimezone: true }), // Time window this chunk represents
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userKindIdx: index("user_chunks_user_kind_idx").on(table.userId, table.kind),
  userOccurredIdx: index("user_chunks_user_occurred_idx").on(table.userId, table.occurredAt.desc()),
}));

export const insertKnowledgeChunkSchema = createInsertSchema(knowledgeChunks).omit({
  id: true,
  updatedAt: true,
});
export type InsertKnowledgeChunk = z.infer<typeof insertKnowledgeChunkSchema>;
export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;

export const insertUserChunkSchema = createInsertSchema(userChunks).omit({
  id: true,
  createdAt: true,
});
export type InsertUserChunk = z.infer<typeof insertUserChunkSchema>;
export type UserChunk = typeof userChunks.$inferSelect;

export const upliftingMessages = pgTable("uplifting_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  text: text("text").notNull(),
  active: boolean("active").default(true),
  weight: integer("weight").default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUpliftingMessageSchema = createInsertSchema(upliftingMessages).omit({
  id: true,
  createdAt: true,
});
export type InsertUpliftingMessage = z.infer<typeof insertUpliftingMessageSchema>;
export type UpliftingMessage = typeof upliftingMessages.$inferSelect;
