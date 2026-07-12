-- Sasist Printer Agent MVP — initial schema (2026-07-11)
-- Applied automatically via backend/db/printing_schema.py (Tier 1 ensure).
-- This file documents the canonical structure for DBA review and external migrations.

CREATE TABLE IF NOT EXISTS printer_agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
    machine_id VARCHAR(128) NOT NULL,
    name VARCHAR(120) NOT NULL,
    token_hash VARCHAR(128) NOT NULL,
    version VARCHAR(32),
    last_seen_at DATETIME,
    is_online BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    CONSTRAINT uq_printer_agent_tenant_machine UNIQUE (tenant_id, machine_id)
);

CREATE INDEX IF NOT EXISTS ix_printer_agents_tenant_id ON printer_agents(tenant_id);
CREATE INDEX IF NOT EXISTS ix_printer_agents_warehouse_id ON printer_agents(warehouse_id);

CREATE TABLE IF NOT EXISTS agent_printers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL REFERENCES printer_agents(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    system_name VARCHAR(255) NOT NULL,
    printer_type VARCHAR(16) NOT NULL DEFAULT 'other',
    is_default BOOLEAN NOT NULL DEFAULT 0,
    capabilities_json TEXT,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    CONSTRAINT uq_agent_printer_system_name UNIQUE (agent_id, system_name)
);

CREATE INDEX IF NOT EXISTS ix_agent_printers_agent_id ON agent_printers(agent_id);
CREATE INDEX IF NOT EXISTS ix_agent_printers_printer_type ON agent_printers(printer_type);

CREATE TABLE IF NOT EXISTS print_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
    printer_id INTEGER NOT NULL REFERENCES agent_printers(id) ON DELETE CASCADE,
    document_type VARCHAR(64) NOT NULL,
    document_id INTEGER,
    payload_json TEXT NOT NULL DEFAULT '{}',
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at DATETIME NOT NULL,
    started_at DATETIME,
    finished_at DATETIME
);

CREATE INDEX IF NOT EXISTS ix_print_jobs_tenant_id ON print_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS ix_print_jobs_warehouse_id ON print_jobs(warehouse_id);
CREATE INDEX IF NOT EXISTS ix_print_jobs_printer_id ON print_jobs(printer_id);
CREATE INDEX IF NOT EXISTS ix_print_jobs_status ON print_jobs(status);
CREATE INDEX IF NOT EXISTS ix_print_jobs_status_printer_created
    ON print_jobs(status, printer_id, created_at);

CREATE TABLE IF NOT EXISTS printing_defaults (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE CASCADE,
    printer_type VARCHAR(16) NOT NULL,
    agent_printer_id INTEGER NOT NULL REFERENCES agent_printers(id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    CONSTRAINT uq_printing_default_tenant_wh_type UNIQUE (tenant_id, warehouse_id, printer_type)
);

CREATE INDEX IF NOT EXISTS ix_printing_defaults_tenant_id ON printing_defaults(tenant_id);
CREATE INDEX IF NOT EXISTS ix_printing_defaults_warehouse_id ON printing_defaults(warehouse_id);
CREATE INDEX IF NOT EXISTS ix_printing_defaults_agent_printer_id ON printing_defaults(agent_printer_id);
