-- Inventory / Stock Count module — initial schema (2026-06-08)
-- Applied automatically via backend/db/inventory_count_schema.py (Tier 1 ensure).
-- This file documents the canonical structure for DBA review and external migrations.

-- ERP document header
-- inventory_documents (tenant_id, warehouse_id, number, type, status, strategy, KPIs, audit timestamps)

-- Expected vs counted lines (operate against snapshot, not live stock)
-- inventory_document_lines (location_id, product_id, expected/counted/difference, lot/serial, confidence_score)

-- Raw scan events (append-only)
-- inventory_count_entries (line_id, user_id, session_id, quantity, source, barcode)

-- Point-in-time snapshots at inventory start
-- inventory_snapshots + inventory_snapshot_stock_lines
-- + inventory_snapshot_reservation_lines + inventory_snapshot_serial_lines

-- Post-approval corrections
-- inventory_adjustments (RW/PW linkage via stock_document_id)

-- WMS operator work
-- inventory_tasks (location-scoped) + inventory_sessions (multi-user parallel counting)

-- Location locking during count
-- inventory_location_locks (soft | hard | snapshot)

-- Full audit trail + photo attachment placeholders
-- inventory_audit_events + inventory_line_attachments
