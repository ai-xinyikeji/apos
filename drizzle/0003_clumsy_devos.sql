CREATE TABLE `cost_records` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` text NOT NULL,
	`user_id` text,
	`provider` text NOT NULL,
	`model_name` text NOT NULL,
	`task_type` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`cache_creation_tokens` integer DEFAULT 0,
	`cache_read_tokens` integer DEFAULT 0,
	`total_cost` integer NOT NULL,
	`cache_savings` integer DEFAULT 0,
	`routing_decision_id` text,
	`created_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_cost_records_timestamp` ON `cost_records` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_cost_records_user_id` ON `cost_records` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_cost_records_provider` ON `cost_records` (`provider`);--> statement-breakpoint
CREATE INDEX `idx_cost_records_task_type` ON `cost_records` (`task_type`);--> statement-breakpoint
CREATE TABLE `custom_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`priority` integer DEFAULT 50 NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`task_types` text,
	`context_size_min` integer,
	`context_size_max` integer,
	`code_complexity_min` integer,
	`code_complexity_max` integer,
	`target_provider` text NOT NULL,
	`target_model` text NOT NULL,
	`match_count` integer DEFAULT 0,
	`last_matched_at` text,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_custom_rules_user_id` ON `custom_rules` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_custom_rules_priority` ON `custom_rules` (`priority`);--> statement-breakpoint
CREATE INDEX `idx_custom_rules_enabled` ON `custom_rules` (`enabled`);