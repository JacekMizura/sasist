# Change log

## 2026-06-04 — sale_documents PostgreSQL DATETIME fix + startup-only schema

- `payment_captured_at DATETIME` failed on PostgreSQL (`type "datetime" does not exist`).
- Added `ensure_sale_documents_orm_columns` — dialect-safe ORM column sync via `CreateColumn`.
- Tier 0 startup: `ensure_sale_documents_orm_columns` runs synchronously before requests.
- Removed `_ensure_direct_sale_complete_schema()` from `complete_service.py` — no ALTER TABLE on `/complete`.
- `ensure_sale_documents_extended_columns` delegates to ORM sync.
- Tests: `test_sale_documents_schema_postgres.py`.

## 2026-06-04 — Direct Sales /complete PostgreSQL FOR UPDATE fix

- Root cause: `get_session_for_complete()` used `joinedload(DirectSaleSession.lines)` + `with_for_update()` — PostgreSQL rejects `FOR UPDATE` on nullable outer-join side.
- Fix: lock session row only; eager-load lines via separate SELECT (`sess.lines`).
- Tests: `test_direct_sale_session_for_update.py` (SQL compile + optional live PostgreSQL).

## 2026-06-04 — Direct Sales /complete raw exception logging

- Removed `logger.exception()`, ORM inspect, and `str(exc)` SQL dumps from complete debug path.
- `safe_exception_str/repr` use `exc.orig` only for SQLAlchemy errors.
- API returns `exc_type`, `exc_repr`, `exc_str`, `traceback`, `orig` — SQL in separate `sql_statement` field (truncated).
- Global handler + `log_unhandled_exception` use safe summaries.

## 2026-06-04 — Direct Sales /complete PendingRollbackError guard

- Failure paths: explicit `db.rollback()` before error JSON; no ORM relationship access after rollback.
- `root_complete_exception()` unwraps PendingRollbackError → underlying IntegrityError/OperationalError.
- `wz_service`: scalar capture of `sale_document.id` before flush; rollback on link flush failure.
- `_fail_stage`: scalar capture before rollback; reload fresh session with joinedload.
- `expire_on_commit=True` (SQLAlchemy default) — success path uses fresh queries / result scalars only.
- Tests: `test_direct_sale_complete_rollback.py`.

## 2026-06-04 — Direct Sales /complete root cause + fix

- `OperationalError`: missing `sale_documents.document_type_id` at `generate_documents` — `ensure_sale_documents_extended_columns` in complete schema bootstrap.
- `IntegrityError`: `order_items.source_movement_id` FK — WZ path now stores `warehouse_inventory_movements.id`, not `stock_operations.id`.
- Logging: removed reserved `message` key from `complete_debug_log` extra dict.
- Tests: `test_direct_sale_complete_schema.py`; e2e `scripts/repro_complete_e2e.py` passes.

## 2026-06-06 — Sale document UI/data unification

- **`sale_document_mapper.py`** — single canonical DTO for list + detail + Direct Sales summary.
- Financials always recomputed from order lines (never stale `sale_documents.total_*`).
- Payment: `payment_method`, `payment_status`, `payment_label_pl` on all surfaces.
- Legacy numbers: `PA/{YEAR}/{MONTH}/1` → display "Numer legacy (wymaga korekty)".
- **`CommercialSaleDocumentView`** — shared commercial detail layout (buyer/seller, VAT, payment, warehouse, history).
- Brutto line gross stored in `order_items.metadata_json.line_gross_total`; legacy single-line fallback uses `order.value`.

## 2026-06-06 — Direct sales documents unified with standard pipeline

- Numbering via `allocate_next_document_number`; VAT brutto→net; payment on `sale_documents`.

## Prior: complete idempotency, provider wiring, reserve_stock fix
