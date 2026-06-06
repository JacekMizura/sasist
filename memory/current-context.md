# Current context

## Active goal
Direct Sales /complete root cause fixed: missing `sale_documents.document_type_id` column at `generate_documents` stage.

## Real exception (2026-06-04)
- `sqlalchemy.exc.OperationalError`: `no such column: sale_documents.document_type_id`
- Stage: `generate_documents` (`pipeline_orchestrator.py:233`)
- Fix: `ensure_sale_documents_extended_columns` in `_ensure_direct_sale_complete_schema`
- Secondary: logging `extra.message` KeyError in `complete_debug_log.py` — fixed

## Staged pipeline (2026-06-04)
- `pipeline_orchestrator.run_staged_complete_pipeline` — 5 commits per request
- States: OPEN → PAYMENT_STARTED → PAYMENT_CONFIRMED → DOCUMENTS_CREATED → WAREHOUSE_ISSUED → COMPLETED | FAILED
- `pipeline_status`, `pipeline_failed_stage`, `pipeline_state_json` on `direct_sale_sessions`
- FAILED sessions retryable; partial entity IDs preserved
- API: no blanket rollback on DirectSaleError; commit failures → PIPELINE_FAILED

## Prior: WZ as warehouse-effect doc
- PA/FV commercial only; WZ performs FIFO/stock issue
