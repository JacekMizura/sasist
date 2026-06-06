# Current context

## Active goal
Direct Sales completion must be staged, idempotent, and recoverable — no SESSION_INVALID on commit/pipeline failures.

## Staged pipeline (2026-06-04)
- `pipeline_orchestrator.run_staged_complete_pipeline` — 5 commits per request
- States: OPEN → PAYMENT_STARTED → PAYMENT_CONFIRMED → DOCUMENTS_CREATED → WAREHOUSE_ISSUED → COMPLETED | FAILED
- `pipeline_status`, `pipeline_failed_stage`, `pipeline_state_json` on `direct_sale_sessions`
- FAILED sessions retryable; partial entity IDs preserved
- API: no blanket rollback on DirectSaleError; commit failures → PIPELINE_FAILED

## Prior: WZ as warehouse-effect doc
- PA/FV commercial only; WZ performs FIFO/stock issue
