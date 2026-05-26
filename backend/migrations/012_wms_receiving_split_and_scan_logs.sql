-- WMS blind receiving: persisted carton/loose split on PZ lines + scan audit log.
-- SQLite: columns are also applied at runtime via backend/db/schema_upgrade.py (ensure_stock_document_item_receiving_split_columns, ensure_receiving_scan_logs_table).
-- PostgreSQL: run these statements if you manage schema manually (otherwise rely on schema_upgrade on startup).

-- stock_document_items
ALTER TABLE stock_document_items ADD COLUMN IF NOT EXISTS cartons_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stock_document_items ADD COLUMN IF NOT EXISTS loose_units_count INTEGER NOT NULL DEFAULT 0;

-- receiving_scan_logs
CREATE TABLE IF NOT EXISTS receiving_scan_logs (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES stock_documents(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES stock_document_items(id) ON DELETE CASCADE,
    admin_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
    quantity_added DOUBLE PRECISION NOT NULL,
    packaging_type VARCHAR(32) NOT NULL,
    cartons_added INTEGER,
    loose_units_added INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc', now()))
);
CREATE INDEX IF NOT EXISTS ix_receiving_scan_logs_document ON receiving_scan_logs(document_id);
CREATE INDEX IF NOT EXISTS ix_receiving_scan_logs_item ON receiving_scan_logs(item_id);
CREATE INDEX IF NOT EXISTS ix_receiving_scan_logs_admin ON receiving_scan_logs(admin_id);
