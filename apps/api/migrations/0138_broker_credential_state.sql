ALTER TABLE `broker_connections` ADD `credential_state` text DEFAULT 'active' NOT NULL CHECK (`credential_state` IN ('active', 'reconnect_required'));
