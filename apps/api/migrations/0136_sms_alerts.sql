-- Text-message alerts: the number a trader wants texted, and the proof it is
-- theirs.
--
-- ONLY A VERIFIED NUMBER IS EVER TEXTED, which is why this table carries a code
-- flow rather than a bare phone column. A wrong Pushover key reaches nobody; a
-- wrong phone number reaches a real stranger, repeatedly, with somebody else's
-- trading alerts — and their only way to stop it is to reply STOP to a service
-- they never signed up for. So the number is proved before an alert goes to it.
--
-- The code is stored only as a SHA-256, is single-use, expires, and caps its own
-- wrong guesses, matching the Employee Portal's sign-in codes. `last_sent_at`
-- throttles per ACCOUNT rather than per request: a flood is made by asking
-- again, not by asking twice in one call.
CREATE TABLE `sms_numbers` (
	`user_id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`verified_at` integer,
	`code_hash` text,
	`code_expires_at` integer,
	`code_attempts` integer DEFAULT 0 NOT NULL,
	`last_sent_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
