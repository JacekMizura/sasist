-- Migration: pick_sequence on locations
-- Order in which locations are visited along the warehouse picking path.
-- Used by PickTask generation to select location by path order instead of nearest.

-- SQLite:
ALTER TABLE locations ADD COLUMN pick_sequence INTEGER NULL;

-- PostgreSQL (if needed):
-- ALTER TABLE locations ADD COLUMN IF NOT EXISTS pick_sequence INTEGER NULL;
