# Change log

## 2026-06-08 — WMS inwentaryzacja: location → carrier → product
- `wmsInventoryExecutionContext.ts` — locationContext, carrierContext, grouping, PAL-/BOX- detection
- Hook: auto-aktywacja lokalizacji po załadowaniu taska; carrier przez API; scan z carrier_id
- Backend: linie liczone per (location × product × carrier); `resolve-carrier`; task lines z carrier_code
- UI: `WmsInventoryActiveContextBar`, grupowana lista „Policzone w lokalizacji”

## 2026-06-08 — Submit approval: scoped inventory + Polish errors
- `approval_service`: PARTIAL/CYCLE/CONTROL skip full coverage; smarter WMS task blocking (only incomplete locations); projected recount gate; Polish block messages; rollback on recount failure
- Frontend: `formatInventoryRequestError`, toast + reload doc after failed submit; scoped types in `canSubmitInventoryDocument`

## 2026-06-08 — ERP inwentaryzacja: oś czasu Kontrola
- `inventoryAuditEventLabels.ts` — mapowanie zdarzeń audytu na polskie etykiety operacyjne + `buildInventoryAuditTimeline`
- `InventoryAuditPanel` — gęsta tabela ERP (operator, czas, operacja, produkt/EAN/miniatura, delta ilości); bez surowego JSON/kluczy
- Backend `audit_log_service` — wzbogacenie o `user_name`, `line_context`, `location_name`
- Usunięto redundantny link „← Lista dokumentów” z widoku szczegółów dokumentu

## 2026-06-04 — WMS production execution UI shell alignment
- `/wms/production/*` renders inside shared `WmsOperationalLayout` + `WmsTopBar` (removed hideProductionTopBar)
- Removed duplicate header from `WmsProductionExecutionLayout` (icon, TERMINAL WMS, mode title, Menu WMS)
- Removed extra amber „Prod. WMS” button from topbar — single „Produkcja — wykonanie” in module nav
- Workflow tabs only (Zbieranie / Wykonanie / Odłożenie) + `WMS_OPERATIONAL_CONTAINER` spacing
- Centered empty states via `WmsProductionTerminalEmptyState`

## 2026-06-04 — Production schema platform integrity
- Fail-fast `run_production_schema_startup_gate` (import + tier0); blocks on missing tables/columns/types + required batch columns
- `GET /health/schema` — dialect, generation `12`, drift fields (Railway/CI/support)
- Startup logs: `PRODUCTION_SCHEMA_VERSION=12`, `[production.schema.audit.summary]`
- Workers guarded via `schema_guard.require_production_schema_valid`; background upgrade aborts workers on gate failure
- PostgreSQL no-op wrapper logs `SCHEMA_HELPER_SKIPPED_POSTGRES` + allowlist warning (production helpers exempt)
- Tests: `test_production_schema_platform.py` (27 production schema tests passing)

## 2026-06-04 — Composition Engine + Batch/Wave Production
- `product_compositions` + `product_composition_lines` (bundle | manufacturing modes, no product_type)
- `production_batches` + `production_batch_lines`; aggregated component demand + shortages
- Migration from `production_recipes`; recipe service syncs compositions; stock docs link batch_id
- API: `/compositions`, `/production/batches`; frontend Kompozycje tab + batch Produkcja UI
- Tests: `test_composition_batch.py` (aggregation engine)

## 2026-06-04 — Manufacturing / Production module (WMS)
- PostgreSQL-safe migration `ensure_production_tables` (recipes, orders, line snapshots)
- Recipe service + production order service (FIFO consume, RW/PW docs, valuation on complete)
- API router `/production`; no `product_type` enum
- Frontend: Produkcja nav + list/detail UI; product tab with recipe editor and component usage
- Tests: recipe calculations, schema, self-reference guard

## 2026-06-04 — Direct Sales PDF + Dokumenty print templates
- Root-cause fix: sale PDF 500 (`map_sale_document` keyword-only call)
- Central `document_print_service` with logging, builtin/custom template fallback, PDF validation
- Auto-seed Paragon/FV/WZ/Korekta A4 templates (stable slugs) in label template Dokumenty category
- Frontend PDF fetch validates `%PDF` bytes; print errors surface backend `detail`

## 2026-06-04 — WZ warehouse document cleanup
- `wz_service`: finalize WZ as `completed` with line net/VAT pricing and document totals
- Stock document list/read: order number, series prefix, customer, financial totals for WZ
- `DocumentsWarehousePage` WZ tab: removed payment columns; ZREALIZOWANA status; warehouse-oriented line table

## 2026-06-04 — Retail/POS workflow (Direct Sales)
- Auto retail customer (`Klient detaliczny`) on every new session
- Document-first flow: PA = retail badge; FV = NIP lookup + invoice customer upsert
- Line + order discounts with backend canonical totals (`session_financials_service`)
- Discount settings + admin panel section; server-side max-% validation
- Complete pipeline reads session `document_subtype`; `httpx` for MF NIP API

## 2026-06-04 — Direct-sale NET price pipeline fix
- Session `unit_price` is catalog NET; backend no longer treats it as gross
- `netto_line_to_gross_fields`, updated `compute_direct_sale_session_total` with per-product VAT
- Receipts/documents: 5.00 net / 1.15 VAT / 6.15 gross (was wrongly 4.07/0.93/5.00)

## 2026-06-04 — Financial consistency pass
- Unified order line financials on `sale_document_financials.compute_order_line_financials_with_margin`
- Fixed order-level margin: null when `sum_purchase_active` is zero (no more false 100%)
- Frontend order detail: display-only `line_gross_total` / `unit_price_gross` (fixes 5.01 brutto bug)
- Direct-sale completion traceability: load issue movements from WZ / `source_movement_id`
- PA series padding repair at seed (`padding_length=0`)
- Operational debug panel gated to Vite DEV only

## 2026-06-04 — POS UX polish
- PDF print endpoints wired; formatMoneyPl; stationary-sale labels; linked documents UI
