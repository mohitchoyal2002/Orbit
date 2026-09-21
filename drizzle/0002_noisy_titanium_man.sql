CREATE TABLE `coaching_bookings` (
	`lead_id` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`client_id` text NOT NULL,
	`slot_id` text NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`slot_id`) REFERENCES `coaching_slots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_coaching_booking_version` ON `coaching_bookings` (`id`);--> statement-breakpoint
CREATE INDEX `idx_coaching_bookings_slot` ON `coaching_bookings` (`client_id`,`slot_id`,`status`);--> statement-breakpoint
CREATE TABLE `coaching_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`direction` text NOT NULL,
	`kind` text DEFAULT 'text' NOT NULL,
	`body` text NOT NULL,
	`parameters` text DEFAULT '[]' NOT NULL,
	`status` text NOT NULL,
	`provider_id` text,
	`error_code` text,
	`booking_id` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_until` integer,
	`claim_token` text,
	`send_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_coaching_messages_thread` ON `coaching_messages` (`client_id`,`lead_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_coaching_messages_due` ON `coaching_messages` (`status`,`send_at`);--> statement-breakpoint
CREATE INDEX `idx_coaching_provider` ON `coaching_messages` (`client_id`,`provider_id`);--> statement-breakpoint
CREATE TABLE `coaching_settings` (
	`client_id` text PRIMARY KEY NOT NULL,
	`is_demo` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `coaching_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`course` text NOT NULL,
	`centre` text NOT NULL,
	`starts_at` integer NOT NULL,
	`capacity` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_coaching_slots_time` ON `coaching_slots` (`client_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `coaching_students` (
	`lead_id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`phone` text NOT NULL,
	`course` text NOT NULL,
	`centre` text DEFAULT 'Bhawarkua' NOT NULL,
	`learning_mode` text DEFAULT 'Undecided' NOT NULL,
	`source` text NOT NULL,
	`stage` text DEFAULT 'new' NOT NULL,
	`background` text DEFAULT '' NOT NULL,
	`assigned_to` text DEFAULT '' NOT NULL,
	`handoff` integer DEFAULT 0 NOT NULL,
	`last_inbound_at` integer,
	`offered_slots` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_coaching_phone` ON `coaching_students` (`client_id`,`phone`);--> statement-breakpoint
CREATE INDEX `idx_coaching_stage` ON `coaching_students` (`client_id`,`stage`);