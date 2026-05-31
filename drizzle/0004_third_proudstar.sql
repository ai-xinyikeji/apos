CREATE TABLE `budget_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` text NOT NULL,
	`user_id` text,
	`period` text NOT NULL,
	`threshold` integer NOT NULL,
	`current_spend` integer NOT NULL,
	`budget_limit` integer NOT NULL,
	`severity` text NOT NULL,
	`acknowledged` integer DEFAULT 0,
	`acknowledged_at` text,
	`created_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_budget_alerts_user_id` ON `budget_alerts` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_budget_alerts_timestamp` ON `budget_alerts` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_budget_alerts_acknowledged` ON `budget_alerts` (`acknowledged`);