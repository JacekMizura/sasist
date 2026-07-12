-- Integration API keys for printer agents, integrations, webhooks, public API.
-- Canonical structure for DBA review; applied at runtime via ensure_integration_api_keys_schema().

CREATE TABLE IF NOT EXISTS integration_api_keys (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    key_hash VARCHAR(128) NOT NULL UNIQUE,
    key_prefix VARCHAR(32) NOT NULL,
    type VARCHAR(32) NOT NULL,
    warehouse_id INTEGER NULL REFERENCES warehouses(id) ON DELETE SET NULL,
    created_by INTEGER NULL REFERENCES app_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
    last_used_at TIMESTAMP NULL,
    last_used_ip VARCHAR(64) NULL,
    expires_at TIMESTAMP NULL,
    revoked_at TIMESTAMP NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS ix_integration_api_keys_tenant_id ON integration_api_keys (tenant_id);
CREATE INDEX IF NOT EXISTS ix_integration_api_keys_type ON integration_api_keys (type);
CREATE INDEX IF NOT EXISTS ix_integration_api_keys_warehouse_id ON integration_api_keys (warehouse_id);
