import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ============================================================================
// CREATORS
// A creator can exist across multiple platforms (e.g., same person on Patreon + Substack)
// ============================================================================
export const creators = sqliteTable('creators', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(), // URL-friendly identifier
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  websiteUrl: text('website_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// ============================================================================
// SUBSCRIPTIONS
// Your relationship to a creator on a specific platform
// ============================================================================
export const subscriptions = sqliteTable('subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  creatorId: integer('creator_id').notNull().references(() => creators.id, { onDelete: 'cascade' }),
  
  // Platform info
  platform: text('platform').notNull(), // 'patreon' | 'substack' | 'gumroad' | 'discord'
  externalId: text('external_id'), // Platform's ID for this subscription
  profileUrl: text('profile_url'), // Link to creator's page on platform
  
  // Tier/pricing
  tierName: text('tier_name'),
  costCents: integer('cost_cents').notNull().default(0), // Store in cents to avoid float issues
  currency: text('currency').notNull().default('USD'),
  billingCycle: text('billing_cycle').notNull().default('monthly'), // 'monthly' | 'yearly' | 'one-time'
  
  // Status
  status: text('status').notNull().default('active'), // 'active' | 'paused' | 'cancelled'
  memberSince: integer('member_since', { mode: 'timestamp' }),
  
  // Sync tracking
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
  syncEnabled: integer('sync_enabled', { mode: 'boolean' }).notNull().default(true),
  autoDownloadEnabled: integer('auto_download_enabled', { mode: 'boolean' }).notNull().default(true),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// ============================================================================
// CONTENT ITEMS
// Individual posts, uploads, or content pieces from a subscription
// ============================================================================
export const contentItems = sqliteTable('content_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  subscriptionId: integer('subscription_id').notNull().references(() => subscriptions.id, { onDelete: 'cascade' }),
  
  // Content identification
  externalId: text('external_id'), // Platform's ID for this content
  externalUrl: text('external_url'), // Original URL on platform
  
  // Content metadata
  title: text('title').notNull(),
  description: text('description'),
  contentType: text('content_type').notNull(), // 'video' | 'image' | 'pdf' | 'audio' | 'article' | 'attachment'
  
  // Timing
  publishedAt: integer('published_at', { mode: 'timestamp' }),
  
  // User interaction
  isSeen: integer('is_seen', { mode: 'boolean' }).notNull().default(false),
  seenAt: integer('seen_at', { mode: 'timestamp' }),
  
  // Tags (stored as JSON array)
  tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),
  autoTags: text('auto_tags', { mode: 'json' }).$type<string[]>().default([]), // AI-generated tags
  
  // Archive status
  isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
  archiveError: text('archive_error'), // Error message if download failed
  
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// ============================================================================
// DOWNLOADS
// Actual files on disk, linked to content items
// A content item can have multiple downloads (e.g., video + thumbnail + attachments)
// ============================================================================
export const downloads = sqliteTable('downloads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contentItemId: integer('content_item_id').notNull().references(() => contentItems.id, { onDelete: 'cascade' }),
  
  // File info
  fileName: text('file_name').notNull(),
  fileType: text('file_type').notNull(), // 'video' | 'image' | 'pdf' | 'audio' | etc.
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes'),
  
  // Local storage
  localPath: text('local_path').notNull(), // Relative path from archive root
  
  // Download tracking
  downloadedAt: integer('downloaded_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// ============================================================================
// SYNC LOGS
// Track sync history for each subscription
// ============================================================================
export const syncLogs = sqliteTable('sync_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  subscriptionId: integer('subscription_id').notNull().references(() => subscriptions.id, { onDelete: 'cascade' }),
  
  // Timing
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  
  // Results
  status: text('status').notNull().default('running'), // 'running' | 'success' | 'failed'
  itemsFound: integer('items_found').notNull().default(0),
  itemsDownloaded: integer('items_downloaded').notNull().default(0),
  errors: text('errors', { mode: 'json' }).$type<string[]>().default([]),
});

// ============================================================================
// SETTINGS
// App configuration stored as key-value pairs
// ============================================================================
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================
export type Creator = typeof creators.$inferSelect;
export type NewCreator = typeof creators.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type ContentItem = typeof contentItems.$inferSelect;
export type NewContentItem = typeof contentItems.$inferInsert;

export type Download = typeof downloads.$inferSelect;
export type NewDownload = typeof downloads.$inferInsert;

export type SyncLog = typeof syncLogs.$inferSelect;
export type NewSyncLog = typeof syncLogs.$inferInsert;

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

// ============================================================================
// PLATFORM & CONTENT TYPE ENUMS (for type safety)
// ============================================================================
export const PLATFORMS = ['patreon', 'substack', 'gumroad', 'discord'] as const;
export type Platform = typeof PLATFORMS[number];

export const CONTENT_TYPES = ['video', 'image', 'pdf', 'audio', 'article', 'attachment'] as const;
export type ContentType = typeof CONTENT_TYPES[number];

export const BILLING_CYCLES = ['monthly', 'yearly', 'one-time'] as const;
export type BillingCycle = typeof BILLING_CYCLES[number];

export const SUBSCRIPTION_STATUSES = ['active', 'paused', 'cancelled'] as const;
export type SubscriptionStatus = typeof SUBSCRIPTION_STATUSES[number];
