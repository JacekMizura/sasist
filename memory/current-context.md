# Current context

## Active goal
Direct Sales /complete PostgreSQL schema fix applied — `DATETIME` → ORM `TIMESTAMP` sync at startup.

## Real exception (PostgreSQL production)
- `type "datetime" does not exist` on `ALTER TABLE sale_documents ADD COLUMN payment_captured_at DATETIME`
- Cause: `/complete` called `ensure_sale_documents_extended_columns` with SQLite-only `DATETIME` type
- Fix: `ensure_sale_documents_orm_columns` (dialect-safe ORM sync) in Tier 0 startup; removed runtime schema from `complete_service.py`

## Prior fixes
- `FOR UPDATE` + `joinedload` on `get_session_for_complete` — split lock/load
- `sale_documents.document_type_id` missing — ORM sync
- FK on `order_items.source_movement_id` — WZ path fix

## Staged pipeline
- `pipeline_orchestrator.run_staged_complete_pipeline` — 5 commits per request
- States: OPEN → … → COMPLETED | FAILED
- Schema ensures: Tier 0 sync at startup only (never on `/complete`)
