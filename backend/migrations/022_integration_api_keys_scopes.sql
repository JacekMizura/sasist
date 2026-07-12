-- Integration API keys — scopes, IP restrictions, usage tracking (v2).
-- Canonical structure for DBA review; applied at runtime via ensure_integration_api_keys_schema().

ALTER TABLE integration_api_keys ADD COLUMN IF NOT EXISTS description TEXT NULL;
ALTER TABLE integration_api_keys ADD COLUMN IF NOT EXISTS scopes_json TEXT NULL;
ALTER TABLE integration_api_keys ADD COLUMN IF NOT EXISTS allowed_ips_json TEXT NULL;
ALTER TABLE integration_api_keys ADD COLUMN IF NOT EXISTS last_used_user_agent VARCHAR(512) NULL;
ALTER TABLE integration_api_keys ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;

-- Backfill printer_agent scopes for existing rows (idempotent via application layer on read).
