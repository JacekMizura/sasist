# Current context

## Active goal
Direct Sales /complete PostgreSQL lock fix applied.

## Real exception (PostgreSQL production)
- `FOR UPDATE cannot be applied to the nullable side of an outer join`
- Location: `session_service.get_session_for_complete()` — `joinedload(lines)` + `with_for_update()`
- Fix: lock `DirectSaleSession` only; load `lines` in separate query (`sess.lines`)
- Regression: `backend/tests/test_direct_sale_session_for_update.py`

## Prior exceptions (SQLite local)
- `no such column: sale_documents.document_type_id` — fixed via `ensure_sale_documents_extended_columns`
- FK on `order_items.source_movement_id` — fixed in `wz_service.py`

## Staged pipeline (2026-06-04)
- `pipeline_orchestrator.run_staged_complete_pipeline` — 5 commits per request
- States: OPEN → PAYMENT_STARTED → PAYMENT_CONFIRMED → DOCUMENTS_CREATED → WAREHOUSE_ISSUED → COMPLETED | FAILED
- `pipeline_status`, `pipeline_failed_stage`, `pipeline_state_json` on `direct_sale_sessions`
- FAILED sessions retryable; partial entity IDs preserved
- API: no blanket rollback on DirectSaleError; commit failures → PIPELINE_FAILED

## Prior: WZ as warehouse-effect doc
- PA/FV commercial only; WZ performs FIFO/stock issue
