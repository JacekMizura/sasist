-- Migration: Ensure Order has cart_id, basket_id, total_volume_dm3 for fleet assignment.
-- Run manually if the columns are missing (e.g. DB created before these fields were added).
-- SQLite: use "ALTER TABLE orders ADD COLUMN ..." (no IF NOT EXISTS in older SQLite).

-- cart_id (FK to carts.id) - may already exist
-- ALTER TABLE orders ADD COLUMN cart_id INTEGER REFERENCES carts(id) ON DELETE SET NULL;

-- basket_id (FK to cart_baskets.id)
-- ALTER TABLE orders ADD COLUMN basket_id INTEGER REFERENCES cart_baskets(id) ON DELETE SET NULL;

-- total_volume_dm3 (volume in dm³ set when order is assigned)
-- ALTER TABLE orders ADD COLUMN total_volume_dm3 FLOAT;

-- PostgreSQL / MySQL style (add if not exists via procedure or run once):
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS basket_id INTEGER REFERENCES cart_baskets(id) ON DELETE SET NULL;
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_volume_dm3 FLOAT;
