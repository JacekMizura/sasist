-- Migration: Add coordinates to Location and start position to Warehouse
-- Applied automatically on app startup via _ensure_location_warehouse_columns() in main.py.
-- For reference / manual application:

-- Location: physical position (x, y, z) in warehouse space. Existing rows default to NULL.
ALTER TABLE locations ADD COLUMN x REAL;
ALTER TABLE locations ADD COLUMN y REAL;
ALTER TABLE locations ADD COLUMN z REAL;

-- Warehouse: picker start / packing station. Existing rows default to 0.
ALTER TABLE warehouses ADD COLUMN start_x REAL;
ALTER TABLE warehouses ADD COLUMN start_y REAL;
