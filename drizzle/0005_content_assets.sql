CREATE TABLE IF NOT EXISTS `content_assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content_item_id` integer NOT NULL,
	`url` text NOT NULL,
	`file_name_hint` text,
	`asset_type` text DEFAULT 'attachment' NOT NULL,
	`mime_type_hint` text,
	`status` text DEFAULT 'discovered' NOT NULL,
	`last_error` text,
	`downloaded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`content_item_id`) REFERENCES `content_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `content_assets_item_url_unique` ON `content_assets` (`content_item_id`,`url`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `content_assets_status_idx` ON `content_assets` (`status`,`updated_at`);

