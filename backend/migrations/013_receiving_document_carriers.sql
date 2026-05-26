-- PZ ↔ nośniki (WMS receiving) + linia PZ: faktyczny nośnik przyjęcia.
-- SQLite: kolumny / tabela także przez backend/db/schema_upgrade.py przy starcie.

CREATE TABLE IF NOT EXISTS receiving_document_carriers (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    document_id INTEGER NOT NULL REFERENCES stock_documents(id) ON DELETE CASCADE,
    warehouse_carrier_id INTEGER NOT NULL REFERENCES warehouse_carriers(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc', now()))
);
CREATE INDEX IF NOT EXISTS ix_rdc_tenant ON receiving_document_carriers(tenant_id);
CREATE INDEX IF NOT EXISTS ix_rdc_document ON receiving_document_carriers(document_id);
CREATE INDEX IF NOT EXISTS ix_rdc_carrier ON receiving_document_carriers(warehouse_carrier_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_receiving_doc_carrier ON receiving_document_carriers(document_id, warehouse_carrier_id);

ALTER TABLE stock_document_items ADD COLUMN IF NOT EXISTS warehouse_carrier_id INTEGER REFERENCES warehouse_carriers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_stock_doc_items_line_carrier ON stock_document_items(warehouse_carrier_id);
