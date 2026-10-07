CREATE TABLE `pending_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`parking_session_id` text NOT NULL,
	`amount_cop` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payment_id` text,
	`snapshot_json` text NOT NULL,
	`registered_at` text NOT NULL,
	`settled_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`parking_session_id`) REFERENCES `parking_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "pending_payments_amount_positive" CHECK("pending_payments"."amount_cop" > 0),
	CONSTRAINT "pending_payments_status_valid" CHECK("pending_payments"."status" in ('pending', 'paid')),
	CONSTRAINT "pending_payments_settlement_consistent" CHECK(("pending_payments"."status" = 'paid') = ("pending_payments"."payment_id" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pending_payments_session_unique` ON `pending_payments` (`parking_session_id`);--> statement-breakpoint
CREATE INDEX `pending_payments_status_idx` ON `pending_payments` (`status`,`registered_at`);