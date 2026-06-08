# Current context

## Active goal
Enterprise **Inventory / Stock Count** module — ERP planning + WMS blind counting + snapshot-based reconciliation.

## Inventory count module (2026-06-08)
- **Phase 1**: 13 tables, ERP dashboard/wizard, WMS shell, snapshot capture
- **Phase 2**: line materialization, difference engine, approval→post RW/PW, reports, audit ZIP, WMS execution
- **Phase 3 (latest)**:
  - Granular RBAC (`inventory.*` permissions + 6 role presets)
  - Transactional posting with rollback, idempotency key, duplicate-post guard
  - Optimistic versioning (document + lines) + soft line locks + session heartbeat
  - Immutable audit (previous/next state, session/device/IP)
  - Background jobs (`inventory_jobs`) for reports/audit ZIP
  - Paginated line queries, audit log + timelines API, metrics endpoint
  - Valuation-safe posting via snapshot unit cost metadata
- **WMS reality-first execution (2026-06-08)**:
  - `resolve_barcode_to_line`: global product lookup; auto-creates count line (expected=0) for unplanned/extra/wrong-location scans
  - Discrepancy classes: `EXPECTED`, `EXTRA_PRODUCT`, `UNPLANNED_PRODUCT`, `WRONG_LOCATION`
  - Only unknown catalog barcodes → 404 `barcode_not_found`
  - Carrier optional: location → product; nośnik via optional button
  - Terminal UI: scanned product card (photo, EAN, SKU, qty, badges), recent scans, session summary
  - **Blind terminal strip-down (2026-06-08)**: no expected/diff/progress; white scanner UI; auto +1 on scan; manual qty toggle only; single search field; no emergency search on execution screen
  - Fix: `GET /warehouses/{id}/locations` 500 (`round(None,4)` when `max_weight_kg` unset)
  - **Routing loop fix (2026-06-08)**: `/tasks` wrongly mounted TerminalPage; `loadTask()` navigated inside hydrate effect; route param is now sole SSOT — fetch-only on `taskId` change, navigate only on operator action
- Full design: `memory/inventory-count-module.md`

## Prior goal
Production schema integrity as core platform infrastructure — fail-fast startup, `/health/schema`, worker guards.

## Production schema platform (latest)
- `run_production_schema_startup_gate` blocks boot on structural drift + required `production_batches` columns
- `GET /health/schema` — generation `12`, drift diagnostics; bypasses readiness middleware
- Workers (`document_generation`, `replenishment_scan`, `reservation_expiration`) require valid schema
- PostgreSQL legacy helpers: explicit allowlist; skipped helpers log `SCHEMA_HELPER_SKIPPED_POSTGRES`

## Prior goal
Retail/POS workflow for Direct Sales — document-first checkout, default retail customer, backend-canonical discounts.

## Implemented (2026-06-04)
- **Default retail customer:** `ensure_retail_customer()` auto-assigned on session create; PA keeps retail; FV switches to invoice customer flow
- **Document-first UX:** Paragon/FV toggle before customer; `CustomerPanel` only for FV with MF NIP lookup + CRM upsert
- **Discounts (backend SSOT):** `session_financials_service.py` — line + order %/amount; persisted on session/lines; order creation uses canonical totals
- **Discount settings:** `DirectSalesDiscountSettings` in backend + frontend schema; admin **Rabaty POS** section
- **Discount validation:** `discount_validation_service.py` enforces allow flags + max % on patch
- **Complete pipeline:** uses session `document_subtype` (normalized PA/FV → RECEIPT/INVOICE)
- **Frontend POS:** totals from `session.totals`, line/order discount UI, `LineDiscountPopover` on cart rows
- **NIP lookup:** MF whitelist API (`nip_lookup_service.py`); `httpx` added to requirements

## Prior: NET price pipeline
- Session `unit_price` = NET; `netto_line_to_gross_fields` for gross/VAT

## POS refinement (latest)
- Sidebar: Zawieś/Nowa sesja pinned bottom; discount badge left of qty; print via authenticated PDF blob
- Removed „Wygeneruj ponownie”; Dokumenty category in label templates + seed on startup
- Series `print_template_id` fix in `normalize_series_spec`; KOR preset id=4

## Direct Sales PDF + Dokumenty templates (latest)
- Fixed HTTP 500 on sale PDF: `map_sale_document()` keyword-args + `document_print_service`
- Puppeteer PDF pipeline with logging, fallback templates, `PdfRendererUnavailable` → 503
- Seeded built-in A4 templates (Paragon, FV, WZ, Korekta) in label manager Dokumenty section
- Frontend: PDF blob validation, clearer print errors, HTML/CSS editor for document templates

## WZ warehouse document cleanup
- Direct-sale WZ: status `completed` + workflow DONE; line pricing from order items; totals persisted
- List/detail API: `document_number`, `order_number`, `document_series_prefix`, `customer_name`
- Frontend WZ tab: no payment columns; status `ZREALIZOWANA`; Ilość/brutto columns; clean product images

## Production — ERP management vs WMS execution split (latest)
- **ERP `/production/*`** (`ProductionErpModuleLayout`): Pulpit, Receptury (tabela), Zlecenia, Planowanie, Historia, Analiza kosztów; `/production/batches` → redirect planning
- **WMS `/wms/production/*`**: tylko collecting → execute → putaway; duże karty operatorskie, bez planowania/analityki
- **Sidebar**: flyout **Asortyment** — jeden link **Produkcja** → `/production` (podstrony tylko w zakładkach modułu); **WMS** pod **System**
- **Karta produktu**: zakładka **Produkcja** (`ProductManufacturingPanel`) — tylko BOM/receptura; zestawy sprzedażowe wyłącznie w Asortyment → Zestawy
- **ERP Produkcja**: zakładki orders-first (Pulpit → Zlecenia → Planowanie → Receptury → Historia → Analiza)
- **Fix**: `GET /production/orders/by-product/:id` — odporny na brak tabeli `production_orders`, łączy MO + partie, zwraca `[]` zamiast 500
- **Fix**: batch API — `estimate_composition_cost(composition_id=…)` w preview; `list_batches` → `[]` gdy brak schematu; logowanie + try/catch w `/batches`, `/batches/preview`, `POST /batches`
- Ścieżki: `erpProductionPaths` vs `wmsProductionPaths` w `productionPaths.ts`

## Production — visibility / integration fix (prior)
- **Root cause**: `operationalMode: "production"` hid tile/nav when user `wms_operational_modes` omitted `production`; build also failed on `CompositionVisualEditor.tsx` (`??`/`||` parens).
- **Fix**: removed mode gate from production module; `MANDATORY_WMS_TAB_IDS` in `wmsNavTabs.ts` always injects Produkcja.
- **Always-visible entry points**: ERP sidebar direct links (Terminal WMS + **Produkcja**); WMS menu violet hero banner; WmsTopBar **Produkcja** button; WMS flyout unchanged.
- Routes `/wms/production/*` wrapped in `ErrorBoundary`; frontend `npm run build` succeeds after syntax fix.

## Production — ERP command center UX (prior)
- **Visual identity**: violet/indigo manufacturing shell (`productionTheme.ts`, `ProductionModuleLayout`)
- **Hero command center** (`ProductionHero`): KPIs, shortage alerts, pipeline stage counts, active operator avatars
- **Queue sections** (`ProductionQueueSection` + `QUEUE_SECTIONS`): operational headers, counts, rich empty states
- **ERP batch cards** (`BatchCard`): product thumb stack, priority stripe, operator avatar, progress, full-width CTA
- **Mass planning modal** (`CreateBatchModal`): 3-step flow, recipe search grid, cost/duration preview, aggregated materials
- Backend dashboard: `product_image_urls`, `shortage_count`, `active_operators`; preview: `estimated_cost_net`, `estimated_duration_minutes`
- Prior: WMS sidebar flyout Produkcja; product tab recipes-only; routes `/wms/production/*`

## Production module UX — WMS wiring fix (prior)
- Routes live under `/wms/production/*` (dashboard, batch, collecting, execute, putaway)
- **Produkcja** always visible in WMS top bar (`useWmsPinnedModes` mandatory tab)
- Dashboard banner **NEW PRODUCTION UI ACTIVE** + console debug logs
- Fixed SQLite migration bug: `_columns` → `_table_column_names` in `ensure_product_compositions_and_batches` (was causing 500 on product Kompozycje tab)
- Legacy `/production` redirects to `/wms/production`

## Production module UX redesign (prior)
- Tab navigation: Pulpit, Receptury, Batch, Zbieranie, Produkcja, Odłożenie (`ProductionLayout` + `WmsModuleLayout`)
- Card/grid UI for recipes and batches; recipe detail with component availability grid
- Phased batch workflow: `collecting` → `in_progress` → `putaway` → `completed`
- APIs: `/production/dashboard`, `/production/recipes`, batch `start-collecting`, `finish-collecting`, `production-progress`, `finish-production`, `finish-putaway`
- Operator screens: large collecting cards, +1/+5 production, putaway with location search

## Composition Engine + Batch Production (prior)
- Shared `product_compositions` / `product_composition_lines` (`composition_mode`: bundle | manufacturing)
- Migration `ensure_product_compositions_and_batches` copies `production_recipes` → manufacturing compositions
- API `/compositions`; batch API `/production/batches` with aggregated pick-plan + RW/PW completion
- Recipe CRUD syncs linked composition (`source_recipe_id`); orders get `composition_id`
- Product tab **Kompozycje**: Zestawy + Produkcja visual card editor; Produkcja module is batch-centric
- No `product_type` enums; legacy `bundles` table unchanged

## Manufacturing / Production — execution UX (prior)
- Pick plan API: `/production/orders/{id}/pick-plan` — FIFO auto-allocation + picking-priority location suggestions
- Completion UI: per-component source locations (auto/manual), target location search (debounced), shortage panel
- Recipe FIFO cost estimate API; product **Historia produkcji**; RW/PW ↔ MO backlinks on warehouse docs
- Status labels: Robocze / Zaplanowane / W produkcji / Zakończone / Anulowane

## Manufacturing / Production module (base)
- DB: `production_recipes`, `production_recipe_lines`, `production_orders`, `production_order_lines_snapshot`; `stock_documents.production_order_id`
- No `product_type` enum — role from recipe/bundle relations only
- Backend: recipe CRUD + activate/clone; production orders create/start/complete/cancel; completion → RW+PW docs, FIFO consume, unit cost
- API: `/api/production/*` (recipes + orders)
- Frontend: nav **Produkcja** (`/production`), product tab **Produkcja** + recipe editor; component usage list
- Tests: `backend/tests/test_production.py` (recipe math, schema, self-reference)

## Not yet / follow-up
- Production: create-order UI from product tab; mobile collector scan flow; stock reservations on start
- VIES EU fallback for NIP
- Manager approval + negative margin enforcement
- Quantity keypad modal, payment shortcut polish
- Hide retail system customer from CRM search
- Pre-existing frontend `tsc` errors in scanner hooks (unrelated)
