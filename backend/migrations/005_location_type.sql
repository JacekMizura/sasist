-- Migration: location_type on locations (NORMAL | PICK_START | PACKING | DOCK)
-- Default existing rows to NORMAL. Only one PICK_START per warehouse enforced in application.

-- SQLite:
ALTER TABLE locations ADD COLUMN location_type VARCHAR(20) NOT NULL DEFAULT 'NORMAL';

-- PostgreSQL (if needed):
-- ALTER TABLE locations ADD COLUMN IF NOT EXISTS location_type VARCHAR(20) NOT NULL DEFAULT 'NORMAL';
