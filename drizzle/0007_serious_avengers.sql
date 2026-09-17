PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_rate_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`vehicle_type` text NOT NULL,
	`billing_unit` text NOT NULL,
	`amount_cop` integer NOT NULL,
	`minimum_charge_cop` integer DEFAULT 0 NOT NULL,
	`plena_cop` integer,
	`grace_minutes` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "rate_plans_amount_nonnegative" CHECK("__new_rate_plans"."amount_cop" >= 0),
	CONSTRAINT "rate_plans_minimum_nonnegative" CHECK("__new_rate_plans"."minimum_charge_cop" >= 0),
	CONSTRAINT "rate_plans_plena_nonnegative" CHECK("__new_rate_plans"."plena_cop" is null or "__new_rate_plans"."plena_cop" >= 0),
	CONSTRAINT "rate_plans_grace_nonnegative" CHECK("__new_rate_plans"."grace_minutes" is null or "__new_rate_plans"."grace_minutes" >= 0),
	CONSTRAINT "rate_plans_vehicle_type_valid" CHECK("__new_rate_plans"."vehicle_type" in ('car', 'pickup', 'van', 'taxi', 'bus', 'truck', 'motorcycle', 'scooter', 'bicycle', 'other')),
	CONSTRAINT "rate_plans_unit_valid" CHECK("__new_rate_plans"."billing_unit" in ('minute', 'hour', 'day', 'month')),
	CONSTRAINT "rate_plans_status_valid" CHECK("__new_rate_plans"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
INSERT INTO `__new_rate_plans`("id", "name", "vehicle_type", "billing_unit", "amount_cop", "minimum_charge_cop", "plena_cop", "grace_minutes", "status", "created_at", "updated_at") SELECT "id", "name", "vehicle_type", "billing_unit", "amount_cop", "minimum_charge_cop", "plena_cop", "grace_minutes", "status", "created_at", "updated_at" FROM `rate_plans`;--> statement-breakpoint
DROP TABLE `rate_plans`;--> statement-breakpoint
ALTER TABLE `__new_rate_plans` RENAME TO `rate_plans`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`plate` text NOT NULL,
	`vehicle_type` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "vehicles_plate_normalized" CHECK("__new_vehicles"."plate" = upper("__new_vehicles"."plate")),
	CONSTRAINT "vehicles_plate_length" CHECK(length("__new_vehicles"."plate") between 3 and 8),
	CONSTRAINT "vehicles_type_valid" CHECK("__new_vehicles"."vehicle_type" in ('car', 'pickup', 'van', 'taxi', 'bus', 'truck', 'motorcycle', 'scooter', 'bicycle', 'other')),
	CONSTRAINT "vehicles_status_valid" CHECK("__new_vehicles"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
INSERT INTO `__new_vehicles`("id", "plate", "vehicle_type", "description", "status", "created_at", "updated_at") SELECT "id", "plate", "vehicle_type", "description", "status", "created_at", "updated_at" FROM `vehicles`;--> statement-breakpoint
DROP TABLE `vehicles`;--> statement-breakpoint
ALTER TABLE `__new_vehicles` RENAME TO `vehicles`;--> statement-breakpoint
CREATE UNIQUE INDEX `vehicles_plate_unique` ON `vehicles` (`plate`);--> statement-breakpoint
CREATE INDEX `vehicles_plate_idx` ON `vehicles` (`plate`);