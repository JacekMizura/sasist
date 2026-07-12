-- Printing Phase 3 — auto-print settings (2026-07-11)

CREATE TABLE IF NOT EXISTS printing_auto_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    labels BOOLEAN NOT NULL DEFAULT 0,
    stock_documents BOOLEAN NOT NULL DEFAULT 0,
    sale_documents BOOLEAN NOT NULL DEFAULT 0,
    shipping_labels BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME,
    updated_at DATETIME,
    UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS ix_printing_auto_settings_tenant ON printing_auto_settings(tenant_id);
