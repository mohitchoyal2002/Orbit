CREATE TABLE `google_auth_flows` (
	`id` text PRIMARY KEY NOT NULL,
	`browser_hash` text NOT NULL,
	`verifier` text NOT NULL,
	`nonce` text NOT NULL,
	`origin` text NOT NULL,
	`return_path` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_google_flows_expiry` ON `google_auth_flows` (`expires_at`);--> statement-breakpoint
CREATE TABLE `google_auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`full_name` text,
	`origin` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_google_sessions_expiry` ON `google_auth_sessions` (`expires_at`);