-- Optional post-removal cleanup for ABC/XYZ purchasing segmentation (2026-06-08).
-- DO NOT run automatically. Review on staging first.
--
-- Context: ABC/XYZ was computed at runtime; no dedicated product columns existed.
-- Legacy keys may remain inside JSON config blobs.

-- 1) purchase_auto_rules.config_json — strip obsolete segment filter keys
-- PostgreSQL example (adjust for SQLite if needed):
/*
UPDATE purchase_auto_rules
SET config_json = (
  config_json::jsonb - 'only_segments' - 'segment_range_days'
)::text
WHERE config_json::jsonb ?| array['only_segments', 'segment_range_days'];
*/

-- 2) inventory_count documents — remove abc_class from filters_json (if present)
/*
UPDATE inventory_documents
SET filters_json = (filters_json::jsonb - 'abc_class')::text
WHERE filters_json IS NOT NULL
  AND filters_json::jsonb ? 'abc_class';
*/

-- 3) No DROP COLUMN required — these columns were never persisted on products:
--    abc_class, xyz_class, abc_xyz_segment, priority_segment, inventory_segment
