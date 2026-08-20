CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`document_number` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "employees_status_valid" CHECK("employees"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE INDEX `employees_document_idx` ON `employees` (`document_number`);--> statement-breakpoint
CREATE INDEX `employees_name_idx` ON `employees` (`full_name`);--> statement-breakpoint
ALTER TABLE `cash_register_sessions` ADD `employee_id` text REFERENCES employees(id);--> statement-breakpoint
CREATE INDEX `cash_register_sessions_employee_idx` ON `cash_register_sessions` (`employee_id`);