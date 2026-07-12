-- Heartbeat metadata cache on printer_agents (version/name/printer_count synced each heartbeat)
-- Applied automatically via backend/db/printing_schema.py (Tier 1 ensure).
ALTER TABLE printer_agents ADD COLUMN IF NOT EXISTS printer_count INTEGER;
