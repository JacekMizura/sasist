# Change log

## 2026-06-08 — Fix: eksplozja ilości kartonów (WMS inwentaryzacja)
- Przyczyna: total w szt. dekomponowany przy pack=1, potem ponownie mnożony po załadowaniu unitsPerCarton
- SSOT: cartons + pieces w UI; total tylko computed; API wysyła wyłącznie `quantity` (absolute pieces)
- Resync stanu po załadowaniu opakowania; refs zamiast stale closures
- Backend conflicts: skip lines bez product_id, NaN guard na quantity

## 2026-06-08 — Nowoczesny ekran logowania Sasist (SaaS)
- Split layout: ciemny branding + jasny formularz (`LoginBrandingPanel`, `LoginFormPanel`)
- `ProtectedRoute` — globalna ochrona tras; public: `/login`, `/wms-upload/*`
- Sesja: remember me (localStorage vs sessionStorage), last path redirect, auto refresh token, `auth:session-expired` event
- UX: show/hide password, caps lock, last email, inline errors, API status footer

## 2026-06-08 — Inventory counting UX: terminal + ERP progress
- WMS: optymistyczny licznik po skanie (`applyScanQty` przed API); baza qty z `my_counted_quantity`, nie globalnej sumy
- WMS: header produktu — większe zdjęcie, badge lokalizacji/nośnika (bez duplikatu w belce); konflikt tylko dla kierownika/superadmin
- WMS: kompaktowe liczniki; dolny pasek: Nieznany (warning), Wada (danger), Zakończ (primary)
- ERP tab „Przebieg liczenia”: osobny wiersz per operator przy konflikcie (`expandOperatorRows`)

## 2026-06-08 — ERP inventory: uproszczony przebieg liczenia (UI only)
- Usunięto kolumnę „Źródło stanu”; nośnik pod lokalizacją (`InventoryLocationStack`)
- Produkt: większe zdjęcie, nazwa/EAN/SKU; bez nośnika pod produktem
- Konflikty: POLICZ. pokazuje operatorów osobno (nie suma); badge „Konflikt liczenia”; akcje zatwierdź/recount (istniejące endpointy)
- Usunięto listę „Policzone w lokalizacji” → **Ostatnio policzone przeze mnie** (max 2 pozycje)
- Hero produktu: duże zdjęcie (bez ramek) → nazwa → EAN → lokalizacja → nośnik → kartony/sztuki/suma
- Nośnik przypisywany w kontekście produktu (nie w belce lokalizacji)
- Wada przeniesiona do dolnego paska: `[ Nieznany ] [ Wada ] [ Zakończ ]`
- Backend: liczenia operatorów **nie sumują się** (27 + 8 ≠ 35); konflikt → `line.counted_quantity = null`, wpisy per operator w `inventory_count_entries`
- API WMS: `scope=mine` na liniach, `my_counted_quantity` / `operator_count_conflict` na skanie

## 2026-06-08 — WMS inventory terminal UI (mockup-aligned)
- Presentation-only restyle of operator flow: document cards, location scan, product scan, qty modal
- New/updated `ui/wms/` components: `WmsInventoryLandingView`, `WmsInventoryProductDetailPanel`, mockup theme tokens
- Hooks, API, scan handlers, counting logic unchanged; ERP admin inventory untouched

## 2026-06-08 — Inventory UX: portal dropdown + draft delete
- Reports document picker renders via portal (`z-index: 10050`) — no clipping under sticky ERP chrome
- Draft documents deletable from list (trash action + confirm modal); `DELETE /inventory-count/documents/{id}` with status/session validation

## 2026-06-08 — ERP inventory layout unified with panel shell
- Replaced custom inventory shell (`max-w-[1600px]`, white full-page) with standard `PageLayout` + `SettingsModuleStack` (same as Producenci / Administratorzy)
- Module header: breadcrumbs, title, `TopTabsNavigation`, primary action in header
- Views use `moduleListPageShellClass`, `erpSurfaceCard`, `panelListDense*` table tokens

## 2026-06-08 — ERP inventory admin UI (mockup-aligned, presentation only)
- `ui/erp/theme.ts` — shared tokens: KPI cards, tables, indigo tabs, wizard steps, selection cards, scope box
- `InventoryLayout` — `PageLayout` + indigo tab nav (Pulpit / Dokumenty / Kreator / Raporty)
- Dashboard, documents list, wizard, reports — mockup layout on existing hooks/API
- `InventoryDocumentDetailView` — KPI grid, indigo detail tabs, table shell; approval/conflict/unknown panels unchanged logically
- `InventoryDocumentPicker` — optional `id` + `triggerClassName` for reports selector styling
- WMS inventory terminal untouched; no backend/API/hook changes

## 2026-06-08 — Inventory frontend UI architecture cleanup
- `docs/inventory-architecture.md` — flow maps, routes, persistence, risk files, orphaned legacy
- New `modules/inventoryCount/ui/erp/` + `ui/wms/` presentation layer (themes separated)
- God page split: `useInventoryDocumentDetail` + `InventoryDocumentDetailView`; `useWmsInventoryTerminalPage` + `WmsInventoryTerminalView`
- API split: `inventoryDocumentsApi`, `inventoryApprovalApi`, `inventoryConflictsApi`, `inventoryReportsApi`, `inventoryWmsApi`; barrel `inventoryCountApi.ts`
- Legacy WMS execution files archived to `frontend/_archive/inventory-count-legacy/`
- Deprecated shims at old `erp/components/` and `components/` paths for incremental import migration

## 2026-06-08 — WMS inventory document-scoped entry flow
- WMS `/wms/inventory-count` landing: active docs only (`in_progress`, `awaiting_approval`); drafts/approved/cancelled hidden
- Document cards: number, title, type, scope, progress, operators, conflicts, movement policy, last activity
- Routes: `/d/:documentId` (location scan), `/d/:documentId/count/:taskId` (terminal); legacy `/count/:taskId` redirects
- Sticky header switcher (`WmsInventoryDocumentSwitcher`); sessionStorage per warehouse for active document
- Empty state „Brak aktywnych inwentaryzacji”; „Utwórz dokument” gated by `inventory.submit`
- Backend: `GET /wms/inventory-count/active-documents` + `wms_active_documents_service`

## 2026-06-08 — Inventory start stability + movement enforcement + wizard UX
- **500 on start fixed**: missing `log_inventory_audit` import in `location_lock_service` (triggered when movement policy ≠ allow)
- Start returns structured errors: `scope_not_configured`, `scope_not_materialized`, `inventory_start_failed` (+ 500 fallback with code/details)
- `inventory_movement_guard_service`: real enforcement — picking complete, putaway, replenishment, pick routing suggestions
- Wizard: collapsible product/location pickers, tag chips, product thumbnails, zones hidden, richer summary + full server persist before start
- Partial scope operational impact copy; `formatInventoryRequestError` for start failures

## 2026-06-08 — Inventory operational polish (supervisor + WMS ergonomics)
- Approval safety modal: shortages/surpluses, unknown count, locations, RW/PW preview before submit/approve/post
- `posting_preview_service` + `GET .../posting-preview`; unresolved conflicts in preview
- Dedicated conflict panel: operators, qty, timestamps, carrier, recount state (`GET .../conflicts`)
- Unknown product supervisor resolution: map to catalog product or reject (`GET/POST unknown-products`)
- ERP detail: ops metadata bar (type, policies, warehouse, operators, started/last activity)
- Line table „Źródło stanu”: Na półce vs W nośniku
- WMS sticky context bar: LOKALIZACJA → NOŚNIK → PRODUKT always visible during counting
- Filter/tab state persisted in sessionStorage across Przebieg/Różnice/Kontrola
- KPI valuation tooltips (purchase net / snapshot / FIFO foundation)
- Wizard scope operational presets (bez EAN, ABC A, brak ruchu, nośniki, …)

## 2026-06-08 — Inventory UX production cleanup
- Submit-for-approval: only blocks empty doc, wrong status, operator recount conflicts (not partial count, differences, open WMS tasks)
- KPI: „Konflikty liczenia” + wartość nadwyżek/braków PLN (removed dead „Wpływ netto”)
- ERP tabs: filter toolbar on Przebieg / Różnice / Kontrola
- WMS: carrier hierarchy card (LOCATION → CARRIER → PRODUCTS)
- Editable document title + notes; scope preview API + wizard location/product pickers
- Wizard: 4 steps (removed fake Zadania step)

## 2026-06-08 — Inventory strategy simplification (operator-first config)
- Replaced snapshot/soft/hard with movement policies: allow_operations | block_picking | block_all
- Result policy: update_stock | count_only | report_only — post skips RW/PW for non-update modes
- Partial scope modes in wizard: zones, locations, products, categories, carriers, dynamic filters
- Materialization respects scope_mode + expanded filters; legacy lock_mode values normalized
- Wizard redesigned: Typ → Zakres → Ustawienia → Podsumowanie; removed recount_required checkbox
- Detail page shows operator settings; conditional „Zakończ bez korekt” vs „Księguj RW/PW”

## 2026-06-08 — Recount vs inventory variance (domain fix)
- Różnice expected≠counted → supervisor_review, NIE mandatory recount
- `recount_conflict_service`: recount tylko przy konflikcie operatorów (ten sam produkt/lokalizacja, różne ilości)
- `recount_state`: none | required | resolved na liniach; approval blokuje tylko nierozwiązane konflikty
- UI: „Różnica” vs „Wymaga ponownego liczenia” vs „Zweryfikowano”

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
