-- Persist last putaway operator/qty on stock_document_items (WMS audit strip).
-- SQLite: also applied via ensure_stock_document_item_putaway_meta_columns in schema_upgrade.py.

ALTER TABLE stock_document_items ADD COLUMN putaway_last_admin_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE stock_document_items ADD COLUMN putaway_last_quantity REAL;
