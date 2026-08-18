CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`actor` text DEFAULT 'local-operator' NOT NULL,
	`details_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `cash_register_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`opened_at` text NOT NULL,
	`closed_at` text,
	`opening_amount_cop` integer NOT NULL,
	`closing_amount_cop` integer,
	`expected_amount_cop` integer,
	`status` text DEFAULT 'open' NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "cash_register_opening_nonnegative" CHECK("cash_register_sessions"."opening_amount_cop" >= 0),
	CONSTRAINT "cash_register_status_valid" CHECK("cash_register_sessions"."status" in ('open', 'closed'))
);
--> statement-breakpoint
CREATE INDEX `cash_register_sessions_status_idx` ON `cash_register_sessions` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `cash_register_only_one_open` ON `cash_register_sessions` (`status`) WHERE "cash_register_sessions"."status" = 'open';--> statement-breakpoint
CREATE TABLE `monthly_customers` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`document_number` text,
	`phone` text,
	`email` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "monthly_customers_status_valid" CHECK("monthly_customers"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE INDEX `monthly_customers_document_idx` ON `monthly_customers` (`document_number`);--> statement-breakpoint
CREATE TABLE `monthly_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`rate_plan_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`amount_cop` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `monthly_customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`rate_plan_id`) REFERENCES `rate_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "monthly_subscriptions_amount_nonnegative" CHECK("monthly_subscriptions"."amount_cop" >= 0),
	CONSTRAINT "monthly_subscriptions_dates_valid" CHECK("monthly_subscriptions"."ends_at" > "monthly_subscriptions"."starts_at"),
	CONSTRAINT "monthly_subscriptions_status_valid" CHECK("monthly_subscriptions"."status" in ('pending', 'active', 'expired', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX `monthly_subscriptions_customer_idx` ON `monthly_subscriptions` (`customer_id`);--> statement-breakpoint
CREATE TABLE `parking_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL,
	`rate_plan_id` text,
	`entered_at` text NOT NULL,
	`exited_at` text,
	`status` text DEFAULT 'active' NOT NULL,
	`calculated_amount_cop` integer,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`rate_plan_id`) REFERENCES `rate_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "parking_sessions_amount_nonnegative" CHECK("parking_sessions"."calculated_amount_cop" is null or "parking_sessions"."calculated_amount_cop" >= 0),
	CONSTRAINT "parking_sessions_status_valid" CHECK("parking_sessions"."status" in ('active', 'closed', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX `parking_sessions_active_idx` ON `parking_sessions` (`status`,`entered_at`);--> statement-breakpoint
CREATE INDEX `parking_sessions_vehicle_idx` ON `parking_sessions` (`vehicle_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `parking_sessions_one_active_vehicle` ON `parking_sessions` (`vehicle_id`) WHERE "parking_sessions"."status" = 'active';--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`parking_session_id` text,
	`subscription_id` text,
	`cash_register_session_id` text,
	`amount_cop` integer NOT NULL,
	`method` text NOT NULL,
	`status` text NOT NULL,
	`paid_at` text NOT NULL,
	`reference` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`parking_session_id`) REFERENCES `parking_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`subscription_id`) REFERENCES `monthly_subscriptions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`cash_register_session_id`) REFERENCES `cash_register_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "payments_amount_positive" CHECK("payments"."amount_cop" > 0),
	CONSTRAINT "payments_subject_present" CHECK("payments"."parking_session_id" is not null or "payments"."subscription_id" is not null),
	CONSTRAINT "payments_method_valid" CHECK("payments"."method" in ('cash', 'card', 'transfer', 'other')),
	CONSTRAINT "payments_status_valid" CHECK("payments"."status" in ('completed', 'voided', 'refunded'))
);
--> statement-breakpoint
CREATE INDEX `payments_paid_at_idx` ON `payments` (`paid_at`);--> statement-breakpoint
CREATE TABLE `rate_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`vehicle_type` text NOT NULL,
	`billing_unit` text NOT NULL,
	`amount_cop` integer NOT NULL,
	`grace_minutes` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "rate_plans_amount_nonnegative" CHECK("rate_plans"."amount_cop" >= 0),
	CONSTRAINT "rate_plans_grace_nonnegative" CHECK("rate_plans"."grace_minutes" >= 0),
	CONSTRAINT "rate_plans_vehicle_type_valid" CHECK("rate_plans"."vehicle_type" in ('car', 'motorcycle', 'bicycle', 'other')),
	CONSTRAINT "rate_plans_unit_valid" CHECK("rate_plans"."billing_unit" in ('hour', 'day', 'month')),
	CONSTRAINT "rate_plans_status_valid" CHECK("rate_plans"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_number` integer NOT NULL,
	`payment_id` text NOT NULL,
	`issued_at` text NOT NULL,
	`printed_at` text,
	`status` text DEFAULT 'issued' NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "receipts_number_positive" CHECK("receipts"."receipt_number" > 0),
	CONSTRAINT "receipts_status_valid" CHECK("receipts"."status" in ('issued', 'voided'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_number_unique` ON `receipts` (`receipt_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_payment_unique` ON `receipts` (`payment_id`);--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`plate` text NOT NULL,
	`vehicle_type` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "vehicles_plate_normalized" CHECK("vehicles"."plate" = upper("vehicles"."plate")),
	CONSTRAINT "vehicles_plate_length" CHECK(length("vehicles"."plate") between 3 and 8),
	CONSTRAINT "vehicles_type_valid" CHECK("vehicles"."vehicle_type" in ('car', 'motorcycle', 'bicycle', 'other')),
	CONSTRAINT "vehicles_status_valid" CHECK("vehicles"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vehicles_plate_unique` ON `vehicles` (`plate`);--> statement-breakpoint
CREATE INDEX `vehicles_plate_idx` ON `vehicles` (`plate`);