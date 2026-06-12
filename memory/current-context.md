# Current context

## Multi-WH foundation — network ATP + fulfillment flags (2026-06-08)
- Pola na **`TenantWarehouse`** (per tenant+magazyn): `participates_in_network_stock`, `fulfillment_eligible`, `fulfillment_priority` (default 100)
- SSOT ATP sieci: `network_commercial_availability_service.py` → `network_commercially_sellable_qty` = suma `commercially_sellable_qty` po WH z flagą sieciową
- API: `GET/POST /tenant-warehouses/` rozszerzone; **`PATCH /tenant-warehouses/{id}`** — ustawienia sprzedaży/realizacji
- Produkt: `network_commercially_sellable_qty` tylko na **`GET /products/{id}/`** (karta, zakładka Magazyn); lista bez zmian
- UI: Ustawienia → Firma → Magazyny → edycja → „Sprzedaż i realizacja”
- Schema: `tenant_warehouse_fulfillment_schema.ensure_tenant_warehouse_fulfillment_schema`
- Tests: `backend/tests/network_stock/test_network_commercial_availability.py` (3/3)
- **Bez zmian:** Order, Wave, PickTask, StockReservation, WZ, RecoveryWorkflow, sourcing

## Purchase PZ sales block MVP (2026-06-08)
- Overlay handlowy na `stock_document_items` (tylko PZ zakupowe): `sales_blocked_qty`, `sales_block_reason_code`, `sales_block_note`, `sales_blocked_at/by`
- SSOT projekcji: `commercial_availability_service.py` — `effective_sales_block` z wirtualną konsumpcją LIFO po ISSUE; **bez zmian inventory/putaway/MM/pick**
- `commercially_sellable_qty` = `saleable_available_qty` − effective block (nowe pole API produktu / WMS view; `disposition_stock` bez zmian)
- Gate: OMS (`validate_merged_stock`), `offer_available_qty`, fala (`wave_service` commercial_remaining)
- API: `PATCH /stock-documents/{id}/lines/{line_id}/sales-block`
- UI: PZ w Dokumenty magazynowe → panel „Blokada sprzedaży”; produkt → dostępne handlowo / zablokowane
- Schema: `purchase_sales_block_schema.ensure_purchase_sales_block_schema`
- Tests: `backend/tests/purchase_sales_block/test_commercial_availability.py` (5/5)

## Inventory management policy Etap 3B (2026-06-08)
- `wms_settings.inventory_management_mode`: `DOCUMENTS_ONLY` | `HYBRID` (default) | `EXTERNAL_INVENTORY` (model/API only — no UI/logic)
- SSOT: `inventory_management_policy_service.py` — `get_inventory_management_mode`, `can_manual_adjust_stock`, gates
- HYBRID manual correction: `POST /wms/inventory/manual-adjustment` → RK doc + `StockOperation` + `upsert_dock_inventory_for_loose_receipt` / FIFO issue
- Blocked paths: `POST /inventory/`, product `stock_quantity` update (both modes — HYBRID wymusza audytowaną korektę)
- UI: WMS Settings → Ustawienia wspólne → Polityka aktualizacji stanów; produkt → „Korekta stanu” (HYBRID only)
- Schema: `inventory_management_policy_schema.ensure_inventory_management_policy_schema`
- Tests: `backend/tests/inventory_management/test_inventory_management_policy.py`

## Product sales offers Etap 3A — minimal internal layer (2026-06-08)
- Tabela `product_sales_offers` + FK: `order_items.product_sales_offer_id`, `direct_sale_session_lines.product_sales_offer_id`
- Unikalność aktywnej oferty per `(tenant, product, stock_disposition)` — rozszerzalne (OUTLET_C, REFURBISHED)
- **Cena:** `sale_price_net` nullable → fallback do `Product.sale_price` (`effective_offer_sale_price_net` / `uses_product_price`)
- **Dostępność SSOT:** `offer_available_qty()` → puli z oferty, bez cross-pool (outlet ≠ SALEABLE)
- **Outlet placeholders (3B+):** `outlet_damage_class`, `outlet_damage_reasons_json`, `outlet_description` (nullable, bez UI)
- API: `GET/POST/PATCH/DELETE /products/{id}/sales-offers`, `GET /sales-offers/search`
- Zamówienia: `OrderCreateLine.offer_id` → snapshot `offer_name_snapshot` + `required_stock_disposition` z oferty
- Direct sale: auto-wybór przy 1 aktywnej ofercie; `offer_id` w add-product/scan; wyszukiwarka = 1 wiersz / oferta
- UI: zakładka **Oferty** w `ProductEditModal` → `ProductSalesOffersSection`; OMS picker przy >1 ofercie
- Backfill: `python -m backend.scripts.backfill_product_sales_offers [--tenant-id N] [--dry-run]`
- Test E2E: `backend/tests/product_sales_offers/test_outlet_offer_stock_isolation.py` (SALEABLE=100, OUTLET_B=1, qty=2 → błąd)

## Stock disposition Etap 2 — reservation / pick by pool (2026-06-08)
- Kolumny: `order_items.required_stock_disposition`, `stock_reservations.stock_disposition`, `pick_tasks.stock_disposition`
- Schema: `stock_disposition_stage2_schema.ensure_stock_disposition_stage2_columns`
- SSOT alokacji: `inventory_allocation_service` (FEFO + `reserved_qty_at_lot` per disposition)
- Fala / rezerwacje / PickTask: `wave_service` z `resolve_order_item_required_disposition`
- Picking consume: `consume_inventory_fifo_slices(..., stock_disposition=...)`, WMS pick z `OrderItem`
- `saleable_available_qty` = `saleable_qty` − rezerwacje ze `stock_disposition=SALEABLE` (dokładne)
- OMS UI: bez selektora OUTLET; API `OrderCreateLine.required_stock_disposition` (backend akceptuje OUTLET_B)
- Direct sale / import / reklamacje: domyślnie SALEABLE
- Pre-deploy: `python -m backend.scripts.audit_stock_disposition_stage2` (blokuje przy aktywnych falach/pickach)

## Stock disposition Etap 1 — read-only aggregation (2026-06-08)
- SSOT rozbicia pul: `product_disposition_snapshot_service.py` → `disposition_stock` na API produktu i WMS view
- Pola: `saleable_qty`, `outlet_qty`, `service_qty`, `quarantine_qty`, `scrap_qty`, `rejected_qty`, `physical_qty`, `saleable_available_qty`
- Legacy bez zmian: `stock_quantity`, `available_quantity`, `reserved_quantity`
- UI „Dostępne” = `saleable_qty`; przy rezerwacji: „Zarezerwowane” + „Po rezerwacji” (saleable_available_qty)
- Lista produktów: Dostępne + Fizycznie widoczne bez hover; panel magazynowy + WMS preview rozbicie pul
- Przygotowanie Etap 2: `CANONICAL_PRODUCT_STOCK_DISPOSITIONS` + komentarz pod `OrderItem.required_stock_disposition`

## Complaint → Z-PZ integration (2026-06-08)
- Reklamacje używają tego samego Z-PZ / rozlokowania co RMZ — bez R_PZ i osobnych kolejek
- `physical_receipt_mode`: **WAREHOUSE** (Z-PZ+QUARANTINE+putaway) | **SERVICE_FORWARD** (Z-PZ+SERVICE_C, bez putaway) | **DIRECT_SERVICE** (brak Z-PZ/ruchów)
- Schema: `stock_document_items.source_complaint_*`, `StockDocumentComplaintLink`, `complaints.warehouse_document_id`, `complaints.physical_receipt_mode`
- Serwis: `complaint_receipt_service.py` + `complaint_physical_receipt.py` (bramki putaway)
- API: `PATCH /physical-receipt-mode`, `POST .../warehouse-receive`; lista filtr `physical_receipt_mode`
- WMS UI: radio „Sposób obsługi towaru”; direct-service ukrywa akcje magazynowe

## Inventory damage trace after putaway (2026-06-08)
- `inventory` rozszerzone o: `source_document_line_id`, `damage_class`, `damage_reason_*_json`, `damage_source_reference`, `damage_decided_at/by`
- SSOT budowania: `inventory_damage_trace_service.build_damage_trace_from_document_line()` z `StockDocumentItem` + RMZ `damage_entries_json` / complaint line
- Materializacja: RMZ/complaint receipt → dock inventory; putaway `_transfer_from_dock_to_location` kopiuje trace na lokację docelową
- Badge: `USZKODZONY B` (żółty) / `USZKODZONY C` (czerwony) / fallback `USZKODZONY` bez klasy
- API `damage_trace` w: `GET /products/{id}`, `GET /wms/locations/{id}/visual-context`, `GET /wms/carriers/{id}`, `GET /wms/products/{id}/view`
- FE: `DamageDispositionBadge` + tooltip (klasa, powody, źródło RMZ/REK, data, operator)

## WMS putaway dock vs document qty (2026-06-08)
- PATCH `/wms/putaway/{item_id}` → `patch_wms_putaway_item` → `_transfer_from_dock_to_location` rzuca „Brak wystarczającej ilości w lokacji przyjęcia” gdy `Inventory` w docku < qty, mimo `received_quantity - quantity_putaway > 0`
- Kolejka rozlokowania bazuje na polach dokumentu; Z-PZ/RMA ustawia `location_id` (DOCK) ale `append_receipt_operation` nie tworzy `Inventory` (tylko `StockOperation` + movement log)
- Fix: `sync_dock_inventory_from_document_line` przy Z-PZ receipt (RMZ + complaint); `_ensure_dock_inventory_for_putaway` + retry w `_transfer_from_dock_to_location`; SSOT pozostałości = `_document_line_putaway_remaining`

- Ekran `WmsPutawayPzPage`: odświeżenia = mount, poll 4s, `WMS_RECEIVING_UPDATED_EVENT`, patch carrier-bulk (`PATCH /wms/putaway/carrier-bulk`); brak React Query/SWR
- Jeden endpoint dokumentu PZ: `GET /wms/putaway/pz/{id}` → `get_stock_document_read` / `build_stock_document_read`
- Miganie czerwonego komunikatu: **UI bug** — `setErr(null)` na początku każdego `load()` czyściło banner na czas requestu (co 4s poll); naprawione + `loadSeqRef`, wspólna bramka `putawayDocumentGateError`
- Debug: `[WMS_PUTAWAY_DOC_REFRESH]` w konsoli (DEV lub `localStorage wms.putaway.debug=1`) — `document_id`, `status`, `relocation_status`, `can_putaway`, `source`, `endpoint`

- Root cause: lista używała backend `doc_allows_wms_putaway` (Z_PZ status OPEN/CLOSED), ekran szczegółów wymagał `status === draft` dla nie-PZ → blokada rozlokowania
- Fix: wspólna bramka FE `putawayDocumentGates.ts` = backend; karty listy Z-PZ (badge, numer z `document_number`); etykiety jakości linii (A/B/C) w rozlokowaniu
- Backend list row: `document_type`, `is_return_receipt`; numer preferuje `stock_documents.document_number`; fallback `Z-PZ-YYYY-NNNN`

## WMS complaints UI aligned with RMZ (2026-06-08)
- `WmsComplaintDetailPage`: two-column layout (280–320px sidebar + workspace), header jak RMZ
- Komponenty: `frontend/src/pages/wms/complaints/*` — sidebar pozycji, workspace, uploader (dysk/kamera/QR/kolektor + drag&drop + usuwanie)
- Workflow: duże przyciski decyzji (weryfikacja, naprawa, wymiana, odrzucenie, zwrot, uznana) → `patchComplaintLine` / `patchComplaintStatus` / `updateLineOperation`

## WMS returns Z-PZ → putaway (2026-06-08)
- Flow: RMZ finalize → Z-PZ (dock receipt) → **Rozlokowanie PZ** → lokalizacja + `stock_disposition`
- Collective Z-PZ (`status=OPEN`) trafia do kolejki rozlokowania bez ręcznego zamknięcia nośnika
- `doc_allows_wms_putaway` / `recompute_putaway_status_for_document` obsługują Z-PZ OPEN/CLOSED/draft
- Auto-close `relocation_status=DONE` pominięty dla collective OPEN (nowe linie RMZ resetują OPEN)
- Etykiety stanu w lokalizacjach produktu: (A), (USZKODZONY), (REKLAMACJA)

- **Jedno SSOT:** `POST /wms/returns/id/{id}/finalize` (alias: `/wms/returns/{id}/finalize`) — OMS i WMS ten sam endpoint
- Dokument **Z-PZ** (`Z_PZ`); zbiorczy: advisory lock + partial unique index
- Po finalize: `warehouse_document_id` → edycja zablokowana (API + UI)

## Direct sales line delete (2026-06-08)
- Root cause: `db.refresh(sess)` nie przeładowywał kolekcji `lines` po delete → stale line w totals/enrichment → 500
- Fix: `line_delete_service` + reload sesji przez `get_session` po commit

## Active goal
**Klienci — CRM-lite (iteracyjnie)** bez psucia logiki zamówień / istniejących endpointów.

### Etap 1–2 (done)
- `getCustomerDisplayName()` — wspólna nazwa w liście, karcie, direct sales, zamówieniach
- Order link: badge „Klient niezapisany”, dodaj/połącz z istniejącym, duplikaty przy tworzeniu
- Notatki handlowe (pin, soft delete) na karcie klienta
- Zakładka „Aktywność” — timeline zamówień + notatek
- Historia zakupów: uproszczone filtry + KPI (obrót 30/90/365, ostatni zakup, średni koszyk, max zamówienie)

### Etap 3–5 (planned)
- Tagi i segmenty + filtry listy
- `customer_merge_service` — scalanie duplikatów
- Wiele typów adresów (FV, dostawa, paczkomat…)
- Pełniejszy timeline (FV, paragony, zwroty, reklamacje, GUS, zmiany danych)
- GUS source badges (GUS/MF/VIES/CACHE) + ręczne odświeżenie cache

## Inventory config redesign (2026-06-08)
- Movement policy replaces lock jargon (allow / block pick / block all)
- Result policy: update stock vs count-only vs report-only
- Wizard scope step: partial modes + dynamic filters (stock>0, missing EAN, ABC, manufacturers)
- Recount only on operator conflict (not variance); blind vs control count drives WMS expected qty visibility

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
  - **Compact industrial terminal (2026-06-08)**: integrated live search dropdown; horizontal product preview; inline nośnik chip
  - **Operator terminal flow (2026-06-08)**: entry = scan location (no queue table); count screen with [−][qty][+]; single scan pipeline + 250ms dedupe; backend search fix (products were broken by indent error)
  - **Count aggregation (2026-06-08)**: scans upsert by `line_id` (no duplicate cards); hydrate from task lines; primary list „Policzone w lokalizacji”; PARTIAL shows product stock locations via `LocationBadge` + `/wms/products/{id}/view`
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
