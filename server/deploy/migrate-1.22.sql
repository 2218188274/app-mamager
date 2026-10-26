-- Additive migration. Existing devices, orders, subscriptions and usage stay intact.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username varchar(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_hash varchar(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS users_app_username_unique ON users(app_id, username);
COMMIT;
