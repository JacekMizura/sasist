-- Printing Phase 2 — job history, retry chain, agent diagnostics (2026-07-11)
-- Applied automatically via backend/db/printing_schema.py (Tier 1 ensure).

-- print_jobs extensions
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS copies INTEGER NOT NULL DEFAULT 1;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS parent_job_id INTEGER REFERENCES print_jobs(id) ON DELETE SET NULL;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS retry_number INTEGER NOT NULL DEFAULT 0;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS deleted_at DATETIME;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS source_module VARCHAR(32) NOT NULL DEFAULT 'system';
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS job_type VARCHAR(24) NOT NULL DEFAULT 'pdf';

CREATE INDEX IF NOT EXISTS ix_print_jobs_tenant_created ON print_jobs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS ix_print_jobs_parent ON print_jobs(parent_job_id);
CREATE INDEX IF NOT EXISTS ix_print_jobs_deleted_at ON print_jobs(deleted_at);

-- printer_agents extensions
ALTER TABLE printer_agents ADD COLUMN IF NOT EXISTS last_poll_at DATETIME;
ALTER TABLE printer_agents ADD COLUMN IF NOT EXISTS last_error TEXT;
