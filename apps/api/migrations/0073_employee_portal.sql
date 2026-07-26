CREATE TABLE `employee_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`employee_no` text,
	`title` text,
	`department` text,
	`work_email` text,
	`work_phone` text,
	`location` text,
	`manager_id` text,
	`employment_type` text DEFAULT 'full_time' NOT NULL,
	`started_on` text,
	`status` text DEFAULT 'active' NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`totp_secret` text,
	`totp_enrolled_at` integer,
	`totp_last_step` integer,
	`recovery_codes` text,
	`last_login_at` integer,
	`last_login_ip` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`manager_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `employee_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`stage` text DEFAULT 'active' NOT NULL,
	`ip` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `employee_sessions_user_idx` ON `employee_sessions` (`user_id`);
--> statement-breakpoint
CREATE TABLE `employee_login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`fails` integer DEFAULT 0 NOT NULL,
	`first_fail_at` integer NOT NULL,
	`last_fail_at` integer NOT NULL,
	`locked_until` integer
);
--> statement-breakpoint
CREATE TABLE `employee_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`user_id` text,
	`actor` text,
	`action` text NOT NULL,
	`target` text,
	`detail` text,
	`ip` text,
	`user_agent` text,
	`ok` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `employee_audit_at_idx` ON `employee_audit_log` (`at`);
--> statement-breakpoint
CREATE INDEX `employee_audit_user_idx` ON `employee_audit_log` (`user_id`);
--> statement-breakpoint
CREATE TABLE `employee_announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`author_id` text,
	`author_name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `employee_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category` text DEFAULT 'policy' NOT NULL,
	`summary` text,
	`body` text,
	`link_url` text,
	`author_id` text,
	`author_name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
