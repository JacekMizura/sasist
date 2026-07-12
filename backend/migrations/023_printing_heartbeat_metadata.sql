-- Heartbeat metadata cache on printer_agents (version/name/printer_count synced each heartbeat)
ALTER TABLE printer_agents ADD COLUMN IF NOT EXISTS printer_count INTEGER;
