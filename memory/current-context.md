# Current context

## Active goal
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
