ALTER TABLE `broker_connections` ADD `credential_state` text DEFAULT 'ready' NOT NULL CHECK (`credential_state` IN ('ready', 'reconnect_required'));
