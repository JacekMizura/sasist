-- WMS serial / lot tracking foundation (SQLite)

CREATE TABLE IF NOT EXISTS inventory_serials (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    serial_number VARCHAR(128) NOT NULL,
    batch_number VARCHAR(128) NOT NULL DEFAULT '',
    expiry_date DATE NOT NULL DEFAULT '9999-12-31',
    status VARCHAR(32) NOT NULL DEFAULT 'ON_HAND',
    stock_disposition VARCHAR(32) NOT NULL DEFAULT 'SALEABLE',
    warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE CASCADE,
    location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    carrier_id INTEGER REFERENCES warehouse_carriers(id) ON DELETE SET NULL,
    source_document_id INTEGER REFERENCES stock_documents(id) ON DELETE SET NULL,
    document_line_id INTEGER REFERENCES stock_document_items(id) ON DELETE SET NULL,
    stock_operation_id INTEGER REFERENCES stock_operations(id) ON DELETE SET NULL,
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT uq_inventory_serial_tenant_product_sn UNIQUE (tenant_id, product_id, serial_number)
);

CREATE INDEX IF NOT EXISTS ix_inventory_serials_tenant_id ON inventory_serials(tenant_id);
CREATE INDEX IF NOT EXISTS ix_inventory_serials_product_id ON inventory_serials(product_id);
CREATE INDEX IF NOT EXISTS ix_inventory_serials_serial_number ON inventory_serials(serial_number);
CREATE INDEX IF NOT EXISTS ix_inventory_serials_location_id ON inventory_serials(location_id);
CREATE INDEX IF NOT EXISTS ix_inventory_serials_document_line_id ON inventory_serials(document_line_id);

ALTER TABLE products ADD COLUMN track_serial BOOLEAN NOT NULL DEFAULT 0;

ALTER TABLE receiving_scan_logs ADD COLUMN serial_number VARCHAR(128);
ALTER TABLE receiving_scan_logs ADD COLUMN batch_number VARCHAR(128);
ALTER TABLE receiving_scan_logs ADD COLUMN expiry_date DATE;
ALTER TABLE receiving_scan_logs ADD COLUMN raw_scan VARCHAR(512);
ALTER TABLE receiving_scan_logs ADD COLUMN scan_kind VARCHAR(32);

ALTER TABLE stock_operations ADD COLUMN serial_number VARCHAR(128);
