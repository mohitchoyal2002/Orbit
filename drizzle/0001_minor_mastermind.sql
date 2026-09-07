CREATE TABLE `operation_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`job_id` text NOT NULL,
	`code` text NOT NULL,
	`acknowledged_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `workflow_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_alert_job` ON `operation_alerts` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_alert_client` ON `operation_alerts` (`client_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `case_studies` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`content_hash` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`approved_hash` text,
	`approved_by` text,
	`approved_at` integer,
	`revoked_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_case_client` ON `case_studies` (`client_id`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`intake_key_hash` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `case_consent_events` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`action` text NOT NULL,
	`content_hash` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `case_studies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `feature_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_requests_client` ON `feature_requests` (`client_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `workflow_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`lead_id` text,
	`action` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_at` integer NOT NULL,
	`lease_until` integer,
	`claim_token` text,
	`payload` text,
	`provider_id` text,
	`error_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_due` ON `workflow_jobs` (`status`,`next_at`);--> statement-breakpoint
CREATE INDEX `idx_jobs_client_created` ON `workflow_jobs` (`client_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`external_ref` text NOT NULL,
	`payload_hash` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`brief` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`consent_evidence` text DEFAULT '' NOT NULL,
	`consent_at` integer,
	`opted_out_at` integer,
	`first_response_at` integer,
	`follow_up_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_leads_source` ON `leads` (`client_id`,`external_ref`);--> statement-breakpoint
CREATE INDEX `idx_leads_client_created` ON `leads` (`client_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_leads_follow_up` ON `leads` (`client_id`,`follow_up_at`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`email` text NOT NULL,
	`user_id` text,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_memberships_email` ON `memberships` (`client_id`,`email`);--> statement-breakpoint
CREATE INDEX `idx_memberships_user` ON `memberships` (`user_id`,`active`);--> statement-breakpoint
CREATE TABLE `onboarding` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`item` text NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_onboarding_item` ON `onboarding` (`client_id`,`item`);--> statement-breakpoint
CREATE TABLE `monthly_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`month` text NOT NULL,
	`metrics` text NOT NULL,
	`generated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reports_month` ON `monthly_reports` (`client_id`,`month`);--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`template` text NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workflows_template` ON `workflows` (`client_id`,`template`);