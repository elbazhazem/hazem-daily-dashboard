CREATE TABLE `calendar_connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`account_email` text,
	`encrypted_access_token` text NOT NULL,
	`encrypted_refresh_token` text,
	`token_expiry` integer NOT NULL,
	`scope` text DEFAULT 'https://www.googleapis.com/auth/calendar.readonly' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_calendar_user` ON `calendar_connections` (`user_id`);--> statement-breakpoint
CREATE TABLE `daily_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`note_date` text NOT NULL,
	`title` text DEFAULT 'Daily notes' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_notes_user_date` ON `daily_notes` (`user_id`,`note_date`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`task_date` text NOT NULL,
	`due_time` text,
	`priority` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`category` text DEFAULT 'Academic' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tasks_user_date_id` ON `tasks` (`user_id`,`task_date`,`id`);