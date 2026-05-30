CREATE INDEX `idx_routing_decisions_timestamp` ON `routing_decisions` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_routing_decisions_user_id` ON `routing_decisions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_routing_decisions_task_type` ON `routing_decisions` (`task_type`);--> statement-breakpoint
CREATE INDEX `idx_routing_decisions_provider` ON `routing_decisions` (`selected_provider`);