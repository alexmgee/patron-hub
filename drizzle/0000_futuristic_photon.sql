CREATE TABLE `content_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subscription_id` integer NOT NULL,
	`external_id` text,
	`external_url` text,
	`title` text NOT NULL,
	`description` text,
	`content_type` text NOT NULL,
	`published_at` integer,
	`is_seen` integer DEFAULT false NOT NULL,
	`seen_at` integer,
	`tags` text DEFAULT '[]',
	`auto_tags` text DEFAULT '[]',
	`is_archived` integer DEFAULT false NOT NULL,
	`archive_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `creators` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`avatar_url` text,
	`bio` text,
	`website_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creators_slug_unique` ON `creators` (`slug`);--> statement-breakpoint
CREATE TABLE `downloads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content_item_id` integer NOT NULL,
	`file_name` text NOT NULL,
	`file_type` text NOT NULL,
	`mime_type` text,
	`size_bytes` integer,
	`local_path` text NOT NULL,
	`downloaded_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`content_item_id`) REFERENCES `content_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`creator_id` integer NOT NULL,
	`platform` text NOT NULL,
	`external_id` text,
	`profile_url` text,
	`tier_name` text,
	`cost_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`billing_cycle` text DEFAULT 'monthly' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`member_since` integer,
	`last_synced_at` integer,
	`sync_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subscription_id` integer NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`status` text DEFAULT 'running' NOT NULL,
	`items_found` integer DEFAULT 0 NOT NULL,
	`items_downloaded` integer DEFAULT 0 NOT NULL,
	`errors` text DEFAULT '[]',
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
