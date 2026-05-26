-- Movement ledger for WMS traceability (dual-write with operational inventory).
-- SQLite: also applied via ensure_warehouse_inventory_movements_table in schema_upgrade.py.

CREATE TABLE IF NOT EXISTS warehouse_inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id INTEGER,
    source_document_type VARCHAR(32),
    source_document_id INTEGER,
    source_line_id INTEGER,
    movement_type VARCHAR(32) NOT NULL,
    quantity REAL NOT NULL,
    from_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    to_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    from_carrier_id INTEGER REFERENCES warehouse_carriers(id) ON DELETE SET NULL,
    to_carrier_id INTEGER REFERENCES warehouse_carriers(id) ON DELETE SET NULL,
    lot_number VARCHAR(128),
    serial_number VARCHAR(128),
    expiry_date DATE,
    inventory_bucket VARCHAR(32) NOT NULL DEFAULT 'sellable',
    operator_admin_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
    created_at DATETIME NOT NULL,
    metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS ix_wh_inv_mov_twp ON warehouse_inventory_movements(tenant_id, warehouse_id, product_id, created_at);
CREATE INDEX IF NOT EXISTS ix_wh_inv_mov_line ON warehouse_inventory_movements(source_document_id, source_line_id);
CREATE INDEX IF NOT EXISTS ix_wh_inv_mov_operator ON warehouse_inventory_movements(tenant_id, operator_admin_id, created_at);
