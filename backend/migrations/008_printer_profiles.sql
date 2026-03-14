-- Printer profiles for label calibration (offset/scale during export only).
-- Tables may also be created by Base.metadata.create_all() when models are registered.

CREATE TABLE IF NOT EXISTS printer_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    name VARCHAR(120) NOT NULL,
    dpi INTEGER,
    offset_x_mm REAL DEFAULT 0.0,
    offset_y_mm REAL DEFAULT 0.0,
    scale REAL DEFAULT 1.0,
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_printer_profiles_tenant_id ON printer_profiles(tenant_id);
