-- Link printer profiles to agent printers for queue resolution.
ALTER TABLE printer_profiles ADD COLUMN agent_printer_id INTEGER REFERENCES agent_printers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_printer_profiles_agent_printer_id ON printer_profiles(agent_printer_id);
