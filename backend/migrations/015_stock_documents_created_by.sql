-- Creator of PZ / stock document (WMS + panel)
ALTER TABLE stock_documents ADD COLUMN created_by_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE stock_documents ADD COLUMN created_by_user_name VARCHAR(256);
CREATE INDEX IF NOT EXISTS ix_stock_documents_created_by_user_id ON stock_documents(created_by_user_id);
