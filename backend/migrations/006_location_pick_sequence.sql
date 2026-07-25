-- Migration: pick_sequence on locations (legacy metadata column).
-- Historical: once used for path-order heuristics. Runtime routing SSOT is Authored Warehouse Routing Graph
-- (runtime_graph_reader). Do not use this column for distance, hop cost, or visit order.

-- SQLite:
ALTER TABLE locations ADD COLUMN pick_sequence INTEGER NULL;

-- PostgreSQL (if needed):
-- ALTER TABLE locations ADD COLUMN IF NOT EXISTS pick_sequence INTEGER NULL;
