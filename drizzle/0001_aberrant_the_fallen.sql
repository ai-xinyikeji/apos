CREATE TABLE `code_edges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`target` text NOT NULL,
	`kind` text NOT NULL,
	`line` integer,
	`col` integer,
	`created_at` text
);
--> statement-breakpoint
CREATE TABLE `code_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`qualified_name` text NOT NULL,
	`file_path` text NOT NULL,
	`start_line` integer NOT NULL,
	`end_line` integer NOT NULL,
	`docstring` text,
	`signature` text,
	`is_exported` integer DEFAULT 0,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `conversation_memories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`summary` text NOT NULL,
	`key_facts` text,
	`message_count` integer DEFAULT 0,
	`total_tokens_estimate` integer DEFAULT 0,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `experiments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`feature` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`variant_a` text NOT NULL,
	`variant_b` text NOT NULL,
	`count_a` integer DEFAULT 0,
	`count_b` integer DEFAULT 0,
	`conversion_a` integer DEFAULT 0,
	`conversion_b` integer DEFAULT 0,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event` text NOT NULL,
	`properties` text NOT NULL,
	`timestamp` text
);
--> statement-breakpoint
CREATE TABLE `routing_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` text NOT NULL,
	`user_id` text,
	`task_type` text NOT NULL,
	`prompt_preview` text,
	`context_size` integer NOT NULL,
	`code_complexity` integer,
	`selected_provider` text NOT NULL,
	`selected_model` text NOT NULL,
	`decision_reason` text NOT NULL,
	`custom_rule_id` text,
	`manual_override` integer DEFAULT 0,
	`estimated_cost` integer NOT NULL,
	`estimated_time` integer,
	`actual_cost` integer,
	`actual_time` integer,
	`execution_status` text,
	`uses_extended_thinking` integer DEFAULT 0,
	`thinking_tokens` integer,
	`uses_prompt_caching` integer DEFAULT 0,
	`cache_creation_tokens` integer,
	`cache_read_tokens` integer,
	`user_satisfaction` integer,
	`user_feedback` text,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`tasks` text NOT NULL,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflows_name_unique` ON `workflows` (`name`);