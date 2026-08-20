ALTER TABLE `monthly_customers` ADD `notes` text;--> statement-breakpoint
CREATE INDEX `monthly_customers_name_idx` ON `monthly_customers` (`full_name`);--> statement-breakpoint
ALTER TABLE `monthly_subscriptions` ADD `notes` text;--> statement-breakpoint
CREATE INDEX `monthly_subscriptions_vehicle_idx` ON `monthly_subscriptions` (`vehicle_id`);--> statement-breakpoint
CREATE INDEX `monthly_subscriptions_coverage_idx` ON `monthly_subscriptions` (`status`,`ends_at`);--> statement-breakpoint
ALTER TABLE `parking_sessions` ADD `subscription_id` text REFERENCES monthly_subscriptions(id);--> statement-breakpoint
CREATE INDEX `parking_sessions_subscription_idx` ON `parking_sessions` (`subscription_id`);