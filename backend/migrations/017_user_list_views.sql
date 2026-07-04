-- Per-user list view autosave and named presets (ERP tables).
CREATE TABLE IF NOT EXISTS user_list_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES app_users(id) ON DELETE CASCADE,
    screen_key VARCHAR(128) NOT NULL,
    type VARCHAR(16) NOT NULL,
    name VARCHAR(255),
    is_default BOOLEAN NOT NULL DEFAULT 0,
    is_public BOOLEAN NOT NULL DEFAULT 0,
    payload_json TEXT NOT NULL DEFAULT '{}',
    schema_version INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_user_list_views_tenant_screen ON user_list_views(tenant_id, screen_key);
CREATE INDEX IF NOT EXISTS ix_user_list_views_user_screen ON user_list_views(tenant_id, user_id, screen_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_list_views_autosave
    ON user_list_views(tenant_id, user_id, screen_key)
    WHERE type = 'autosave';
