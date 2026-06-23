CREATE TABLE `tv_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`strategy` text,
	`symbol` text,
	`side` text,
	`entry` real,
	`take_profit` real,
	`stop_loss` real,
	`alert_price` real,
	`alert_time` text,
	`received_at` integer NOT NULL,
	`payload` text NOT NULL
);
