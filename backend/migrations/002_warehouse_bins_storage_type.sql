-- Migration: Add storage_type to warehouse_bins (primary | reserve).
-- Run manually if the column is missing (e.g. DB created before this field was added).
-- After running, existing rows will have NULL; application treats NULL as "primary".

-- SQLite:
-- ALTER TABLE warehouse_bins ADD COLUMN storage_type VARCHAR(32) DEFAULT 'primary';

-- PostgreSQL (IF NOT EXISTS supported in newer versions):
-- ALTER TABLE warehouse_bins ADD COLUMN IF NOT EXISTS storage_type VARCHAR(32) DEFAULT 'primary';
