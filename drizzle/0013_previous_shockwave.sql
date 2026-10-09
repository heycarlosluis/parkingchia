DROP INDEX `receipts_number_unique`;--> statement-breakpoint
ALTER TABLE `receipts` ADD `series` text DEFAULT 'parking' NOT NULL;--> statement-breakpoint
-- Los recibos de mensualidad ya emitidos pasan a su propio consecutivo conservando su número.
UPDATE `receipts` SET `series` = 'monthly' WHERE `payment_id` IN (SELECT `id` FROM `payments` WHERE `subscription_id` IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_series_number_unique` ON `receipts` (`series`,`receipt_number`);