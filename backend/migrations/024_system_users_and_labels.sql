-- System user protection flags + application label dictionary
-- Table: app_users (platform users). Tenant-scoped labels use tenant_id NULL = global.

-- app_users protection (PostgreSQL / SQLite-compatible via ensure_* at startup)
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_system_user BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_deletable BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_role_changeable BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE app_users
SET is_system_user = TRUE, is_deletable = FALSE, is_role_changeable = FALSE
WHERE lower(role) IN ('super_admin', 'superadmin');

CREATE TABLE IF NOT EXISTS system_labels (
    id SERIAL PRIMARY KEY,
    key VARCHAR(191) NOT NULL,
    default_value TEXT NOT NULL DEFAULT '',
    custom_value TEXT NULL,
    tenant_id INTEGER NULL,
    description TEXT NULL,
    category VARCHAR(64) NOT NULL DEFAULT 'general',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_system_labels_key_tenant UNIQUE (key, tenant_id)
);

CREATE INDEX IF NOT EXISTS ix_system_labels_key ON system_labels (key);
CREATE INDEX IF NOT EXISTS ix_system_labels_tenant_id ON system_labels (tenant_id);
CREATE INDEX IF NOT EXISTS ix_system_labels_category ON system_labels (category);
