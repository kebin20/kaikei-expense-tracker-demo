CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`period` text NOT NULL,
	`type` text NOT NULL,
	`category` text NOT NULL,
	`planned_amount` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_budgets_period_type_category` ON `budgets` (`period`,`type`,`category`);--> statement-breakpoint
CREATE INDEX `idx_budgets_period` ON `budgets` (`period`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_date` text NOT NULL,
	`period` text NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_transactions_period_type` ON `transactions` (`period`,`type`);--> statement-breakpoint
CREATE INDEX `idx_transactions_date` ON `transactions` (`transaction_date`);