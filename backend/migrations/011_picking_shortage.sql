-- Opcjonalna migracja ręczna (SQLite): kolumna + tabela audytu.
-- W dev zwykle wystarczy start aplikacji — ``ensure_picking_shortage_support`` w ``schema_upgrade.py``.

ALTER TABLE picking_config ADD COLUMN status_on_shortage_id INTEGER REFERENCES order_ui_statuses(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS wms_picking_shortage_reports (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    source_status_id INTEGER NOT NULL,
    order_type VARCHAR(16) NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    missing_qty FLOAT NOT NULL,
    order_ids_json TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_wms_shortage_wh ON wms_picking_shortage_reports(warehouse_id);
CREATE INDEX IF NOT EXISTS ix_wms_shortage_product ON wms_picking_shortage_reports(product_id);
