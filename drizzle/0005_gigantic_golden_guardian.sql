CREATE TABLE `voice_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`call_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`provider_id` text,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'dispatching' NOT NULL,
	`context_snapshot` text NOT NULL,
	`settings_revision` integer NOT NULL,
	`caller_number` text NOT NULL,
	`duration` integer,
	`interaction_id` text,
	`transcript` text,
	`result_hash` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`call_id`) REFERENCES `voice_calls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_voice_attempt_provider` ON `voice_attempts` (`provider_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_voice_attempt_number` ON `voice_attempts` (`call_id`,`attempt_number`);--> statement-breakpoint
CREATE INDEX `idx_voice_attempt_client_time` ON `voice_attempts` (`client_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `voice_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`phone` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`active_attempt_id` text,
	`error_code` text,
	`outcome` text,
	`summary` text,
	`answers` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_voice_calls_contact` ON `voice_calls` (`client_id`,`phone`);--> statement-breakpoint
CREATE INDEX `idx_voice_calls_due` ON `voice_calls` (`status`,`next_at`);--> statement-breakpoint
CREATE INDEX `idx_voice_calls_client` ON `voice_calls` (`client_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `voice_settings` (
	`client_id` text PRIMARY KEY NOT NULL,
	`admin_enabled` integer DEFAULT 0 NOT NULL,
	`client_enabled` integer DEFAULT 0 NOT NULL,
	`business_context` text DEFAULT '' NOT NULL,
	`role_context` text DEFAULT '' NOT NULL,
	`language` text DEFAULT 'Hindi' NOT NULL,
	`daily_limit` integer DEFAULT 20 NOT NULL,
	`start_hour` integer DEFAULT 10 NOT NULL,
	`end_hour` integer DEFAULT 18 NOT NULL,
	`max_attempts` integer DEFAULT 2 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `voice_suppression` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`phone` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_voice_suppression_contact` ON `voice_suppression` (`client_id`,`phone`);--> statement-breakpoint
ALTER TABLE `leads` ADD `call_consent_at` integer;--> statement-breakpoint
ALTER TABLE `leads` ADD `call_consent_evidence` text DEFAULT '' NOT NULL;