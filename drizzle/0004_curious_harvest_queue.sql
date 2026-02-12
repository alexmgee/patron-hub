CREATE TABLE `harvest_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content_item_id` integer NOT NULL,
	`kind` text DEFAULT 'download_url_resolve' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer,
	`next_attempt_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`content_item_id`) REFERENCES `content_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `harvest_jobs_content_kind_unique` ON `harvest_jobs` (`content_item_id`,`kind`);
--> statement-breakpoint
CREATE INDEX `harvest_jobs_status_next_attempt_idx` ON `harvest_jobs` (`status`,`next_attempt_at`);
