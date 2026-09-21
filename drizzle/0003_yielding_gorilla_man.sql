CREATE TABLE `widget_events` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`session_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`type` text NOT NULL,
	`path` text NOT NULL,
	`properties` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `widget_sites`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `widget_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`visitor_id`) REFERENCES `widget_visitors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_widget_events_site_time` ON `widget_events` (`site_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_widget_events_journey` ON `widget_events` (`site_id`,`visitor_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_widget_events_expiry` ON `widget_events` (`expires_at`);--> statement-breakpoint
CREATE TABLE `widget_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`attribution` text NOT NULL,
	`device` text NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `widget_sites`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`visitor_id`) REFERENCES `widget_visitors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_widget_sessions_site_visitor` ON `widget_sessions` (`site_id`,`visitor_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_widget_sessions_expiry` ON `widget_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `widget_sites` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`origins` text NOT NULL,
	`privacy_url` text NOT NULL,
	`courses` text NOT NULL,
	`color` text DEFAULT '#fa783c' NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`retention_days` integer DEFAULT 90 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_widget_sites_client` ON `widget_sites` (`client_id`);--> statement-breakpoint
CREATE TABLE `widget_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`visitor_id` text,
	`payload_hash` text NOT NULL,
	`course` text NOT NULL,
	`origin` text NOT NULL,
	`contact_consent_at` integer NOT NULL,
	`whatsapp_consent_at` integer,
	`consent_version` text NOT NULL,
	`consent_text` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `widget_sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_widget_submissions_site_time` ON `widget_submissions` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_widget_submissions_visitor` ON `widget_submissions` (`site_id`,`visitor_id`);--> statement-breakpoint
CREATE TABLE `widget_visitors` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`lead_id` text,
	`consent_version` text NOT NULL,
	`consent_at` integer NOT NULL,
	`revoked_at` integer,
	`origin` text NOT NULL,
	`last_seen` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `widget_sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_widget_visitors_site_seen` ON `widget_visitors` (`site_id`,`last_seen`);