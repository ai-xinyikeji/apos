CREATE TABLE `agent_traces` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_name` text NOT NULL,
	`run_id` text NOT NULL,
	`step` text NOT NULL,
	`status` text NOT NULL,
	`message` text NOT NULL,
	`details` text,
	`created_at` text
);
--> statement-breakpoint
CREATE TABLE `prototypes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`branch_name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`code_path` text,
	`preview_url` text,
	`commit_hash` text,
	`pr_number` integer,
	`pr_url` text,
	`feasibility_report` text,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settings_key_unique` ON `settings` (`key`);--> statement-breakpoint
CREATE TABLE `signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`url` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`sentiment` text,
	`created_at` text,
	`updated_at` text
);
