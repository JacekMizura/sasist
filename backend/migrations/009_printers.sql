-- Printers: physical printer linked to a calibration profile.
-- SQLite-compatible.

CREATE TABLE IF NOT EXISTS printers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    profile_id INTEGER REFERENCES printer_profiles(id) ON DELETE SET NULL,
    warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
    connection_type TEXT,
    description TEXT,
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_printers_tenant_id ON printers(tenant_id);
CREATE INDEX IF NOT EXISTS ix_printers_warehouse_id ON printers(warehouse_id);
CREATE INDEX IF NOT EXISTS ix_printers_profile_id ON printers(profile_id);
