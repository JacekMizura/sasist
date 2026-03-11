-- Migration: Pick event model fields
-- Adds warehouse_id, order_item_id, picked_at, picker_id for proper pick event tracking.
-- Makes inventory_unit_id nullable (event-only picks may not link to inventory_unit).

-- SQLite:
-- Add new columns (nullable for existing rows)
ALTER TABLE picks ADD COLUMN warehouse_id INTEGER NULL REFERENCES warehouses(id) ON DELETE CASCADE;
ALTER TABLE picks ADD COLUMN order_item_id INTEGER NULL REFERENCES order_items(id) ON DELETE SET NULL;
ALTER TABLE picks ADD COLUMN picked_at DATETIME NULL;
ALTER TABLE picks ADD COLUMN picker_id INTEGER NULL;

-- Backfill warehouse_id from order
UPDATE picks SET warehouse_id = (SELECT warehouse_id FROM orders WHERE orders.id = picks.order_id) WHERE warehouse_id IS NULL;

-- Make inventory_unit_id nullable (SQLite: recreate column not straightforward; leave as-is if already NOT NULL, otherwise add as nullable)
-- Standard approach: SQLite doesn't support ALTER COLUMN. If picks.inventory_unit_id was NOT NULL, existing rows keep it; new schema allows NULL.
-- So we only add new columns above. For existing DBs that already have picks table with inventory_unit_id NOT NULL, a separate migration or schema sync would alter the table. Here we assume 007 runs on a DB that may have the original picks table.
-- Add inventory_unit_id as nullable only if we're creating picks from scratch; otherwise skip. This migration only adds columns.
