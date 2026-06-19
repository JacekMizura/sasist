# Current context

## Listy modułów — płaski layout (2026-06-08)
- Usunięto card-in-card w Zamówienia / Zwroty / Reklamacje: sidebar bez karty, tabela bez zewnętrznej karty.
- Dodano lekki podział sekcji: `FlatPageSection`, `FlatColumnHeader`, `flatSectionTokens` (separator `#e5e7eb`, odstępy).
- Zastosowano w: listach modułów (toolbar/tabela/sidebar), słownikach zwrotów, konfiguratorze statusów, edytorze układu RMZ.
- **Dodatkowe pola zamówień** (`OrderCustomFieldsListPage`, `OrderCustomFieldEditPage`): lewy shell `moduleSettingsPageShellClass`, lista jak moduły ERP, edycja z `FlatPageSection` + `IntegrationsApiPanel` (Zaawansowane), bez szarych kart.

## Bundle STOCK B1 — UX Simplification (2026-06-08) — CLOSED
- **Raport:** `memory/bundle-stock-b1-ux-simplification-report.md`
- Auto shadow Product przy zapisie STOCK; ukryte pole linked_product_id w UI
- Endpoint `GET /bundles/{id}/warehouse-stock`; shadow products ukryte w liście produktów
- Testy: `test_bundle_stock_b1_auto_provision.py` (9 passed)
- **Fix regresji products_pkey:** `memory/bundle-stock-b1-regression-products-pkey.md` — orphan shadow lookup przed INSERT

## Bundle STOCK Simplification Audit (2026-06-08) — CLOSED (analysis only)
- **Audyt:** `memory/bundle-stock-architecture-audit.md`
- **Plan (rekom. B):** `memory/bundle-stock-simplification-plan.md`
- Werdykt: powiązany produkt = adapter techniczny (brak wartości UX); rekomendacja **B1** auto shadow Product + ukrycie pola ID; **B2** opcjonalnie bundle-native inventory
- **Bez implementacji** do akceptacji PO

## P2.5C.1 — Putaway UI & Operational Validation (2026-06-08) — CLOSED
- **Audyt:** `memory/p2.5c.1-putaway-ui-and-operational-audit.md`
- **Raport impl.:** `memory/p2.5c.1-putaway-ui-implementation-report.md`
- UI: CompanySettings `requires_putaway`; walidacja 409; ATP UX (fizyczny/dostępny/DOCK)
- Audyt: bundle/produkcja OK; MM rekomendacja A (DOCK dozwolony)

## P2.5C — DOCK / ATP / Putaway Implementation (2026-06-08) — CLOSED
- **Raport:** `memory/p2.5c-dock-putaway-implementation-report.md`
- `warehouse.requires_putaway` + auto DOCK-IN/STOCK; A3 fix; pick-eligible filter (ATP/pick/production)
- UX: banner DOCK-IN na przyjęciach; putaway ukryty dla magazynu prostego
- Testy: `test_p2_5c_dock_putaway.py` (9 passed)

## P2.5B — DOCK / ATP & Cost Verification Architecture (2026-06-08) — ANALYSIS CLOSED
- **Raport arch.:** `memory/p2.5b-dock-and-cost-architecture.md`
- Rekomendacja: `warehouse.requires_putaway` + auto DOCK-IN/STOCK; centralny filtr pick-eligible (exclude DOCK z ATP/pick); dual cost light (provisional RECEIPT + `verified_unit_price_net` / `purchase_workflow_status=VERIFIED`)
- Gap as-is: DOCK w ATP/pick; magazyn bez lokalizacji → inventory=0 (A3); ISSUE bez unit_price (COGS)
- Bez implementacji — plan faz §9 w raporcie

## P2.5A — Inbound Lifecycle Architecture (2026-06-08) — ANALYSIS CLOSED
- **Raport arch.:** `memory/p2.5a-inbound-lifecycle-architecture.md`
- **Raport statusów (impl.):** `memory/p2.5a-receiving-workflow-statuses-report.md`
- Rekomendacja: fizyka natychmiast (DOCK) + 3 osie (magazyn / zakup / komercja linii); spór 300+7 = block linii nie PZ; exclude DOCK z pick/sell
- Bez implementacji w tej fazie — plan wdrożenia w raporcie §8

## P2.5A — Receiving Workflow Statuses (2026-06-08) — CLOSED
- **Raport:** `memory/p2.5a-receiving-workflow-statuses-report.md`
- Pola: `warehouse_workflow_status`, `purchase_workflow_status` (niezależne osie)
- Sync magazynowy w `recalculate_wms_document_completion`; PATCH metadata dla statusu zakupowego
- UI: `PzWorkflowStatusBadges` na listach WMS + ERP PZ

## WMS.1 — Operational Readiness Audit (2026-06-08) — CLOSED
- **Raport:** `memory/wms-operational-readiness-audit.md`
- 5 blokery produkcyjne: A3 (brak lokalizacji), B1 (brak WZ e-commerce), D2 (bundle complaint Z-PZ), F2 (batch count), H9 (order GET bez WH gate)
- Przyjęcia z lokalizacjami + zwroty standard + pick/pack/recovery ≈ operacyjne; MM intra-WH OK; A→B tylko konsolidacja
- UX: „Brak propozycji” maskuje przyczyny putaway

## P2.4 — WMS Multi-Warehouse Selector (2026-06-08) — CLOSED
- **Raport:** `memory/p2.4-wms-multi-warehouse-selector-report.md`
- UI: `GlobalWarehouseSelect` w `WmsTopBar`; gate `WmsWarehouseAccessGate` w shellu WMS
- SSOT: `WarehouseContext` + `/auth/me/warehouse-context` / `PUT /auth/me/active-warehouse`
- Odświeżanie: `warehouseRevision`, event `wms:warehouse-changed`, deps `warehouse?.id`
- Testy frontend: `warehouseContextLogic.test.ts`, `wmsWarehouseChange.test.ts`

## P2.3 — Warehouse Ownership Finalization (2026-06-08) — CLOSED
- **Raporty:** `memory/p2.3-purchase-flow-audit.md`, `memory/p2.3-warehouse-ownership-finalization-report.md`
- SSOT łańcuch: PO → Delivery → PZ → Inventory; `warehouse_id` tylko w dół
- ORM guards: PO + Delivery + StockDocument (registered in `main.py`)
- Chain validators: `warehouse_ownership_chain_service`; PZ inherits delivery WH
- API gates: PO + Delivery detail/mutations → P2.2 loaders (404 cross-wh)
- Startup: `[WAREHOUSE_OWNERSHIP_AUDIT]`; script `report_missing_warehouse_ownership`
- Testy: 28 passed (P2.2 + P2.2A + P2.3)

## P2.2A — Warehouse Context Finalization (2026-06-08)
- **Raport:** `memory/p2.2a-warehouse-context-finalization-report.md`
- Putaway item/carrier/suggest → `load_stock_document_item_for_active_warehouse`
- MM draft lines → gate `body.warehouse_id == active WH`
- Production panel → `productionQueryParams` + wszystkie strony WMS/ERP batch/order
- Testy: 10 passed (P2.2 + P2.2A); **wszystkie moduły magazynowe GREEN**

## P2.2 — Warehouse Context Enforcement (2026-06-08)
- **Raport:** `memory/p2.2-warehouse-context-enforcement-report.md`
- SSOT: `warehouse_scoped_access_service.assert_entity_warehouse_matches_active` + loadery w `warehouse_deps`
- Stock documents, receiving, putaway list/detail, MM relocation, production, inventory ERP/WMS task — WH gate
- Cross-wh → HTTP 404; testy: `test_p2_2_warehouse_context_enforcement.py` (6 passed)
- Deliveries: rekomendacja hybrydowa (tenant-central + scoped view) — **bez implementacji**
- YELLOW follow-up: putaway/MM mutacje po `item_id`, WMS inventory scan po linii

## P2.1A — Warehouse Context UX Fix (2026-06-08)
- **Raport:** `memory/p2.1a-warehouse-context-ux-report.md`
- Hook: `useActiveWarehouseContext()` + `ActiveWarehouseRequiredBanner`
- Komunikat SSOT: „Wybierz aktywny magazyn.”
- Poprawione: dostawy, PO generator, PZ WMS, RMZ, reklamacje, produkcja, inwentaryzacja ERP
- API: `createWmsReceivingPz` / `listWmsReceivingPz` z opcjonalnym `warehouse_id`
- Build frontend OK

## P2.1 — Multi Warehouse Hardening (2026-06-08)
- **Raport:** `memory/p2.1-multi-warehouse-hardening-report.md`
- PO generator + alerty: `warehouse_id` obowiązkowe (HTTP 400)
- Usunięto: `maybe_auto_assign_single_warehouse_on_pz`, single-WH fallback w PZ resolve/receiving-target
- Frontend: usunięte `?? 1` / `warehouse_id=1` w kluczowych formularzach (reklamacje, inwentaryzacja, import, regały, zamówienia)
- Legacy: `python -m backend.scripts.report_deliveries_missing_warehouse`
- Testy: 10 passed (PO + StockDocument + InboundDelivery)

## P4.18 — Bundle Warehouse Intelligence (2026-06-08)
- **Raport:** `memory/bundle-warehouse-intelligence-report.md`
- **Werdykt:** **READY** (rekomendacje only — bez automatyzacji)
- Serwisy: analytics, slotting, replenishment, capacity w `backend/services/bundles/intelligence/`
- API: `/bundles/intelligence/*` (dashboard, slotting, replenishment, capacity)
- Frontend: `/analytics/bundle-intelligence` — zakładki Analytics | Slotting | Replenishment | Capacity
- Testy: `test_bundle_intelligence.py`

## P4.17A — Bundle Scanner UX Integration (2026-06-08)
- **Raport:** `memory/bundle-scanner-ux-report.md`
- **Werdykt:** **READY FOR P4.18**
- Pick/pack/returns/complaints/bulk/RK spięte z `bundlesLogisticsApi` + `bundleScannerIntegration`
- UI: `BundlePickingScanCard`, `BundleVerifiedBadge`, `BundleTraceabilityStrip`, RMZ/reklamacje bannery
- Ekran bulk: `/wms/picking/bundle-bulk-scan`
- Testy frontend: `bundleScanFlow.test.ts` (22)
- **Następny:** P4.18 Warehouse Intelligence

## P4.17 — Bundle Logistic Unit & EAN Automation (2026-06-08)
- **Raport:** `memory/bundle-logistic-unit-report.md`
- **Werdykt:** **READY FOR P4.18** (Warehouse Intelligence)
- `resolve_bundle_barcode()` — EAN produktu/bundle, SKU, kod wewnętrzny
- Scan: pick/pack/returns/complaints; ON_DEMAND vs STOCK; bulk STOCK scan
- Model `BundleLogisticUnit` + RK view + wave aggregation helpers
- API: `/bundles/logistics/*`; frontend: `bundlesLogisticsApi.ts`
- Testy: `test_bundle_logistics.py` (42); pakiet bundle 178 passed
- **Następny:** P4.18 slotting, replenishment, forecasting, analytics

## P4.16 — Bundle Traceability & Lot Tracking (2026-06-08)
- **Raport:** `memory/bundle-traceability-report.md`
- Tabela `order_line_bundle_component_lots` — zapis po finalize pick / WZ issue
- Serwisy: lot snapshot, traceability A–D, recall (report only), reports
- API: `/bundles/traceability/*`
- RMZ/reklamacje: `lots[]` na składnikach; UI partia w `BundleReturnLinePanel`
- Testy: `test_bundle_traceability.py` (30) + pakiet bundle 102 passed
- **Następny:** P4.17 Bundle EAN Scan & Advanced Warehouse Automation

## P4.15B — Bundle Operational UX Layer (2026-06-08)
- **Raport:** `memory/bundle-operational-ux-report.md`
- **Werdykt:** **READY FOR TRACEABILITY** → P4.16 lot tracking
- API: `picking_lines()` metadata, `bundle_breakdown`, `order_bundle_trees`, packing `bundle_trees`
- UI: `BundlePickingOrderTree`, `BundlePackingTree`, list breakdown multi-order
- Single/multi: liczy linie operacyjne; cart volume bez parent ON_DEMAND
- Testy: `test_bundle_operational_ux.py` (12) + resolver — 34 passed

## P4.15A — Bundle operational execution review (2026-06-08)
- **Raport:** `memory/bundle-operational-readiness-report.md`
- **Werdykt:** **CHANGES REQUIRED** przed P4.16
- Backend pick (ON_DEMAND=składniki, STOCK=linked SKU) ✅; UI pickingu bez kontekstu bundle ❌
- EAN bundle nie w scan path; regały/nośniki/cross-dock OK z zastrzeżeniami (volume fallback)
- **Proponowany:** P4.15B operational UX hardening → potem P4.16 lot tracking

## P4.15 — Bundle returns, complaints & corrections (2026-06-08)
- **Raport:** `memory/bundle-returns-complaints-report.md`
- Model `return_line_bundle_components` + kolumny `bundle_return_*` na `rmz_lines`
- Serwisy: `bundle_return_service`, `bundle_rmz_receipt_integration`, `bundle_complaint_service`, `bundle_return_reports_service`
- PZ zwrotu: rozwinięcie składników ON_DEMAND via `warehouse_receipt_lines()` (integracja `rmz_return_receipt_service`)
- Refund wyłącznie ze `unit_price_net_snapshot`
- API: drzewo zwrotu, PUT składników, raporty; UI: `BundleReturnLinePanel` w WmsReturnsPage
- Testy: `test_bundle_returns_complaints.py` (38); pakiet bundle 91+ passed
- **Następny:** P4.16 Bundle Traceability & Lot Tracking

## P4.14A — Bundle warehouse documents layer (2026-06-08)
- **Raport:** `memory/bundle-warehouse-documents-report.md`
- Projekcja `warehouse_document_lines()` + `warehouse_receipt_lines()` (PZ)
- Serwis `bundle_warehouse_document_service` — SSOT linii WZ/RW/PW/PZ/MM/RW_WMS
- Facade: `stock_document_service.warehouse_document_lines_for_order()`
- WZ direct sale: walidacja alokacji vs resolver
- Testy: `test_bundle_warehouse_documents.py` (20) + resolver (43 łącznie)
- **Następny:** P4.15 zwroty i reklamacje bundle

## P4.14 — BundleLineResolver SSOT (2026-06-08)
- **Raport:** `memory/bundle-line-resolver-report.md`
- Pakiet `backend/services/bundles/` — jedyny silnik interpretacji linii zestawu
- Projekcje: `commercial_lines`, `picking_lines`, `reservation_lines`, `warehouse_issue_lines`, `margin_lines`, `return_lines`, `complaint_lines`
- Snapshot rozszerzony: `order_id`, `unit_price_net_snapshot` (korekty częściowe — P4.15)
- OMS marża: `margin_from_context()` w order read API
- Singleton: `from backend.services.bundles import bundle_line_resolver`
- Testy: 23 + P0/architektura = 37 passed
- **Następny:** P4.15 zwroty i korekty bundle

## P4.13B — Bundle P0 stabilization (2026-06-08)
- **Raport:** `memory/bundle-stabilization-report.md` — **READY FOR BUNDLELINERESOLVER**
- SSOT linii operacyjnych: `bundle_order_item_ops.py` (`sqlalchemy_operational_picking_order_item_clause`, `filter_operational_order_items`)
- P0-1…P0-5: fale, dashboardy, konsolidacja, routing/quick-pick, recovery/braki, footprint — jeden filtr zamiast `is_bundle_parent=False`
- P0-6 analiza: `memory/bundle-order-cancellation-analysis.md` (scenariusze A–E, bez implementacji)
- P0-7 audyt: `memory/bundle-traceability-audit.md` (pick/allocation → partia → zamówienie)
- Testy: `backend/tests/test_bundle_p0_stabilization.py` (14 passed z architekturą)
- **Nie wdrożono:** BundleLineResolver, zwroty/reklamacje/korekty bundle, unit_price_snapshot (P1)

## P4.13 — Architektura zestawów w zamówieniach / WMS / produkcji (2026-06-08)
- **Spec SSOT:** `memory/bundle-system-architecture.md` — pełny projekt (zwroty, korekty, RW-WMS, raporty)
- Tabela **`order_line_bundle_components`** — snapshot składników przy utworzeniu linii zestawu (nazwa/SKU/EAN/qty + `purchase_price_net_snapshot` pod marżę)
- **`bundle_explosion.py`**: ON_DEMAND → nagłówek + linie składników; STOCK_PRODUCTION → jedna linia (`linked_product_id`) + snapshot bez linii składników
- **`order_bundle_persistence.py`** — wspólny zapis linii + snapshot (create order, add line, import)
- **`bundle_order_item_ops.py`** — eligibility pickingu/pakowania/rezerwacji (STOCK parent operacyjny, ON_DEMAND parent tylko komercja)
- WMS picking/packing: STOCK_PRODUCTION zbierany jako gotowy SKU; ON_DEMAND — składniki ze snapshotu
- API **`OrderItemRead`**: `bundle_fulfillment_mode`, `bundle_components[]`; marża nagłówka z kosztu snapshotu
- Roadmap skan EAN zestawu: **`memory/bundle-order-architecture.md`** (etap 2 — nie wdrożone)

## P4.11 — Typ realizacji zestawu (operacyjna terminologia) (2026-06-08)
- Usunięto „Zestaw wirtualny / fizyczny” — język operacyjny:
  - **ON_DEMAND_ASSEMBLY** — Kompletowany na zamówienie
  - **STOCK_PRODUCTION** — Produkowany / konfekcjonowany na magazyn
- Kolumna DB + API: `bundle_fulfillment_mode`; migracja z `stock_mode` (virtual→ON_DEMAND, physical→STOCK)
- Legacy `stock_mode` / `fulfillment_mode` synchronizowane w backendzie (nie w UI)
- **`BundleFulfillmentTypeSection`** — radio „Typ realizacji zestawu” w Podstawowych
- Magazyn ON_DEMAND: tylko dostępność kompletacji + tabela składników
- Magazyn STOCK: **`BundleStockProductionWarehousePanel`** (jak produkt, via `linked_product_id`)
- Zakładka Produkcja tylko dla STOCK_PRODUCTION — **po Produkty, przed Magazyn** (P4.12)
- **`BundleProductionPanel`**: receptura (tabela ze składników), utwórz zlecenie (ERP recipe + `createProductionOrder`), historia zleceń

## P4.10 — Ceny zestawów (pełna obsługa handlowa) (2026-06-08)
- Zakładka **Ceny** (Tag, po Podstawowych — jak produkt)
- **`EntityPricingPanel`** + **`entityPricing.ts`** — wspólna logika UI/kalkulacji (produkt: koszt bezpośredni; zestaw: ze składników)
- Koszt materiałów: Σ(qty × `product_purchase_price` / `product_cost_service`)
- Pola DB: `extra_cost_packaging_net`, `production_cost_net`; VAT w `metadata_json.bundle_ui.vat_rate`
- API `BundleRead`: `purchase_cost`, `materials_cost`, `packaging_cost`, `production_cost`, `total_cost`, `selling_price_net/gross`, `margin_value/percent`
- Backend: **`bundle_pricing_service.py`**, migracja `ensure_bundles_pricing_columns`
- Header kafelki: Koszt, Cena netto (+ brutto), Marża (live recalc bez zapisu)
- Ostrzeżenia: sprzedaż poniżej kosztu; marża poniżej 10% (domyślna minimalna)
- Historia cen w `metadata_json.price_history` (wpis przy zapisie zmiany ceny)

## P4.9 — Produkcja i kompletacja zestawów (2026-06-08)
- Zakładka **Produkcja** w zestawie (Factory, po Magazynie — jak produkt)
- **`EntityProductionPanel`** — wspólny panel: produkt → `ProductManufacturingPanel`; zestaw → tryb + zawartość
- **`AssemblyComponentsTable`** — tabela składników kompletacji (Produkcja + Magazyn)
- Pola API/DB: `fulfillment_mode` (assembly|manufacturing), `stock_mode` (physical|virtual), `linked_product_id`, `physical_stock`
- Header: badge typu (fizyczny/wirtualny) + źródło (Kompletacja/Produkcja)
- Magazyn: stan + źródło stanu; wirtualny = ze składników, fizyczny = `physical_stock`
- Produkcja zestawu: kompletacja = składniki; produkcja = ten sam `ProductManufacturingPanel` via `linked_product_id`
- WMS auto-dokumenty kompletacji — **nie zaimplementowane** (kolejna iteracja)

## P4.8 — Ujednolicenie modułu Zestawów z Produktami (2026-06-08)
- Zestaw używa tego samego `ProductLikePageLayout` co produkt: stat cards, SKU/EAN pod tytułem, save w headerze, `hideVerticalRail`, ikony w tabs
- Usunięto prawy pionowy navigator; pełna szerokość na treść
- Zakładki: Podstawowe, Produkty, Magazyn, **Zdjęcia**, Historia, Logi, Powiązania, **Etykieta**
- **`CatalogEntityGallerySection`** + **`useCatalogEntityGallery`** — wspólna galeria (produkt może migrować później)
- Tab Produkty: tabela (Zdjęcie, Produkt, SKU, EAN, Ilość, Akcje) + bogata wyszukiwarka z miniaturą
- Składniki: czytelne „Stan magazynowy / Ilość w zestawie / Maks. liczba zestawów”
- Wymiary opakowania zestawu (mm/kg) w Podstawowych + backend `length_mm`, `width_mm`, `height_mm`, `weight_kg`, `metadata_json`
- Tab Magazyn: dostępność ze składników + tabela per produkt

## P5.12J — Ujednolicenie OMS i WMS dla regałów kompletacyjnych (2026-06-08)
- OMS = źródło prawdy struktury; WMS = ten sam układ fizyczny + nakładka operacyjna
- **`ConsolidationRackRenderer`** — wspólna geometria (poziomy, segmenty, proporcje); bez logiki modułu
- **`buildRackLayoutRowsFromDraft`** / **`buildRackLayoutRowsFromGridLevels`** — kanoniczny model `RackLayoutRow[]`
- OMS: `ConsolidationRackOmsPreview` → renderer + `RackLayoutOmsCellContent` (nazwa, wymiary, pojemność)
- WMS: `ConsolidationRackGrid` → renderer + `RackLayoutWmsCellContent` (status, zamówienie, dm³)
- Dashboard WMS przekazuje pełne wymiary segmentów z API (`width_mm`, `height_mm`, `length_mm`)
- Usunięto tabelę HTML (`levelsToGrid`) z widoku operacyjnego — ten sam układ co w OMS

## P5.12I — Spłaszczenie modelu regałów kompletacyjnych (2026-06-08)
- Usunięto pojęcie Rack A/B/C z UX i draftu — model: **Regał → Poziomy → Segmenty** (`draft.levels[]`)
- API: `unit_name: "A"`, `unit_sort_order: 0` (techniczne mapowanie); wczytanie spłaszcza wszystkie poziomy
- Widok główny: `ConsolidationRackOmsPreview` — siatka regału (jak RackPreview), pełna szerokość
- Klik segment → panel boczny 260px (`ConsolidationRackSegmentEditPanel`), bez kart i przycisku „Edytuj”
- Usunięto: `ConsolidationRackVisualEditor`, `ConsolidationRackSegmentDrawer`, `BayDraft` z UI
- Nazewnictwo UI: Regał / Poziom / Segment (bez Rack, Unit, Bay)

## P5.12H — Rezygnacja z dedykowanego edytora (2026-06-08)
- Usunięto drzewo struktury, tabelę segmentów i panel 260px
- Jeden widok: `ConsolidationRackVisualEditor` (wzór `CartSectionGrid` + drawer jak koszyki)
- Segment = klikalny kafel + drawer (SZ/GŁ/WYS/nazwa); edycja = podgląd
- Sidebar: dane regału + preset + liczba poziomów / segmentów na poziom (jak TemplateCreator)
- Auto podział szerokości: `redistributeSegmentWidths` przy add/remove/duplicate/setLevelSegmentCount
- Naprawa `addLevel` (pełna szerokość); zmiana W regału → `applyRackWidthChange`
- Usunięto: `RackStructureTree`, `LevelSegmentConfigTable`
- Workspace: width 100%, minimalne marginesy w `ConsolidationRackFormShell`

## P5.12G — Uproszczenie konfiguracji regałów kompletacyjnych (2026-06-08)
- Usunięto `unit_description` / pole „Opis racka” z UI; API wysyła `unit_description: null`
- Racki auto: `Rack A`, `Rack B`, … (`bayDisplayLabel`, `reindexBays`) — bez formularza nazwy
- **Tabela segmentów** (`LevelSegmentConfigTable`): Segment | SZ | GŁ | WYS | Nazwa — główne miejsce edycji
- Każdy segment niezależnie (W/D/H/nazwa/pojemność); `+ Dodaj segment` / duplikuj / usuń (tylko create)
- Układ workspace: **tabela → podgląd** → panel 260px (pojemność / podsumowanie)
- Drzewo (`RackStructureTree`): nawigacja rack → poziom tylko; segmenty tylko w tabeli
- Edit istniejącego regału: wymiary w tabeli, struktura zablokowana (`structureLocked`)

## P5.12F — Naprawa renderera podglądu OMS (2026-06-08)
- Segmenty: normalizacja `widthFraction` **per poziom** (suma = 100% szerokości wiersza)
- Renderer: CSS flex zamiast SVG viewBox (pełna szerokość kontenera, bez letterboxingu)
- Jedna obudowa regału + słupki + półki między poziomami; 4×4 = 16 widocznych lokalizacji
- Etykieta: nazwa + `500×800×500` (bez pojemności jako głównego elementu)
- Duże regały: scroll wewnątrz podglądu (min wys. pasa), bez rozciągania strony
- Layout: podgląd `flex-1` między sidebarami, panel 260px stały

## P5.12E v2 — Regały kompletacyjne: racki + podgląd fizyczny (2026-06-08)
- Hierarchia: Regał (RK-01) → **Rack** (unit) → Poziomy → Segmenty (`BayDraft` w `rackStructureModel.ts`)
- Backend: `unit_name`, `unit_sort_order`, `unit_description` na `ConsolidationRackLevel` + schema upgrade
- Podgląd OMS: `ConsolidationRackOmsPreview` — jeden SVG obrys na rack (półki wewnątrz, wzór TemplateCreator)
- Panel segmentu **zawsze** 260px po prawej; pusty stan „Wybierz segment” — layout się nie przesuwa
- OMS create/edit: bez wolnych/zajętych/%; tylko konfiguracja (segmenty, racki, wymiary)
- WMS: nadal `ConsolidationRackGrid` + dashboard (osobny renderer operacyjny)
- Drzewo: `RackStructureTree` — 3 poziomy (rack → poziom → segment)

## P5.12D — Refaktor UX kreatora (wersja magazynowa) (2026-06-08)
- Lewa kolumna: drzewo poziomów/segmentów (`RackStructureTree`) zamiast tabeli inline
- Klik poziomu → zaznaczenie + edycja wys./nazwy; klik segmentu → panel po prawej
- `+ Dodaj segment` / usuń segment (równy podział szerokości); `Duplikuj poziom` (`duplicateLevel`)
- Presety: widoczne do wyboru, potem „Preset: 4×4” + [Zmień preset]
- Podgląd: przełącznik Układ | Wymiary | Pojemność (jeden tryb naraz)
- Usunięto `LevelSegmentTable`; skaluje się do dużych regałów (drzewo scroll + 1 formularz)

## P5.12E — Usprawnienie konfiguracji segmentów (2026-06-08)
- Podgląd segmentu: nazwa + SZ/GŁ/WYS (lub `W×D×H` w kompaktowych komórkach) + dm³ — bez samotnego „500 mm”
- Rozwinięty poziom: tabela segmentów (`LevelSegmentTable`) — Seg, SZ, GŁ, WYS, Nazwa + operacje masowe
- Operacje masowe: kopiuj wymiary/głębokość/wysokość; nazwa z numeracją (np. TV → TV-01…)
- Klik segmentu w podglądzie → panel po prawej (`ConsolidationRackSegmentEditPanel`) bez zmian
- Tło spójne z OMS (#fff): `ConsolidationRackFormShell`, edytor, panel — bez szarych paneli
- Podgląd regału: słupki niebieskie, półki z border, kolory jak Twórca szablonu (#eff6ff)
- Pliki: `LevelSegmentTable.tsx`, bulk helpers w `rackStructureModel.ts`, `formatPreviewDims*` w `consolidationRackPreviewLayout.ts`

## P5.12C — Refaktor UX pod duże regały (CAD-style editor) (2026-06-08)
- Accordion poziomów — tylko jeden rozwinięty; segmenty jako małe chipy (max scroll 120px)
- Edycja segmentu: `ConsolidationRackSegmentEditPanel` — zawsze jeden formularz (panel po prawej)
- Podgląd = główny obszar roboczy; klik segmentu → edycja; highlight poziomu + segmentu (orange)
- Layout: nawigacja ~280px | podgląd flex-1 | panel segmentu 260px
- Podgląd max 700px, scroll wewnętrzny; min band 28px przy ≥10 poziomach

## P5.12B — Ostatnie poprawki konfiguratora regałów OMS (2026-06-08)
- Podgląd: wysokość pasa poziomu ∝ `levelHeightMm` (max 640px, min 56px/poziom)
- Szerokości segmentów: flex ∝ `width_mm / totalWidthMm`
- Walidacja Σ szer. = szer. regału (±1 mm); zapis zablokowany + banner
- Wskaźnik: „Wykorzystano X / Y mm szerokości poziomu”
- Presety: 4×4, 3×6, 2×8, pusty regał
- Podgląd zajętości: Wolny/Zajęty, nr zamówienia, % pojemności

## P5.12A — Poprawki UX konfiguratora regałów OMS (2026-06-08)
- Tab **Regały** aktywny na całej ścieżce `/carts/racks/*` (`end: false` w `cartsTabs.ts`)
- **Liczba segmentów na poziomie** — `setLevelSegmentCount()` równy podział szerokości (jak „lokacje na poziom” w szablonie)
- Podgląd: poziomy z etykietą + segmenty (nazwa, SZ·GŁ·WYS, dm³), kolory jak `RackPreview` (#eff6ff/#bfdbfe)
- Skala podglądu: max 640px, flex proporcjonalny szerokości; wysokość pasa ≠ mm 1:1
- `ConsolidationRackFormShell` — preview nie rozciąga się na cały viewport

## P5.12 — Przebudowa konfiguratora regałów kompletacyjnych (poziomy × segmenty) (2026-06-08)
- **Frontend-only UX** — bez zmian `ConsolidationRack` / `ConsolidationRackLevel` / `RackSegment`, API, P5.7–P5.9
- Zastąpiono model „liczba rzędów × kolumn” → **poziomy z własną wysokością + segmenty o zmiennej szerokości**
- Lewa kolumna: dane regału, parametry globalne (szer./głęb. mm), lista poziomów z inline edycją segmentów
- Prawa kolumna: `ConsolidationRackStructurePreview` (SVG, proporcjonalne wys./szer.) — nie uniform 4×4
- **Tworzenie**: `POST /racks/` z `draftToApiPayload()`; dodawanie/usuwanie poziomów i segmentów
- **Edycja**: ten sam ekran, bez modala i klikalnej siatki; struktura zablokowana; `PUT` nazwa + `PATCH` segmentów
- Pliki: `rackStructureModel.ts`, `ConsolidationRackStructureEditor.tsx`, `ConsolidationRackStructurePreview.tsx`; refactor `ConsolidationRackEditorPage`, `ConsolidationRackPreviewPage`
- WMS `ConsolidationRackGrid` bez zmian (operacyjny podgląd)

## P5.11 — Refaktor UX ekranów operacyjnych konsolidacji WMS (2026-06-08)
- **Frontend-only** — bez zmian backend / API / workflow
- Kolejka `/wms/consolidations` = ekran **Do zrobienia** (3 sekcje priorytetów z tower queues + supply plans)
- Pełna szerokość, białe tło (`ConsolidationOperatorPage`), bez `max-w-*` na ekranach operatora
- Usunięto KPI z ekranu regałów; podgląd półek = siatka + legenda kolorów
- Nazewnictwo operacyjne: „Kompletacja międzymagazynowa”, „Rozkładanie na półki”, „Monitor procesu”, „Podgląd półek”
- Regały: `dashboard: false` w WMS menu (narzędzie pomocnicze, nie kafelek startowy)
- KPI/SLA/wykorzystanie tylko w Monitor procesu (Control Tower)
- Pliki: `consolidationOperatorUi.tsx`, refactor queue/racks/staging/detail/tower pages, `wmsTabConfig.ts`

## P5.10 — Refaktor konfiguracji regałów kompletacyjnych OMS-only (2026-06-08)
- **Frontend-only** — bez zmian DB / API / lifecycle / P5.3–P5.9
- **OMS** (`/carts/racks/*`): lista tabeli, kreator/edycja (layout jak Twórca szablonu: lewa kolumna parametrów, prawa siatka), podgląd read-only (`/:id/preview`), edycja (`/:id/edit`)
- **Wspólny profil wymiarowy regału** — domyślnie wszystkie segmenty dziedziczą L×W×H; nadpisanie per segment opcjonalne (modal + fioletowa kropka)
- **Modal segmentu** zamiast panelu bocznego; przycisk „Przywróć ustawienia domyślne"
- **WMS** (`/wms/consolidation-racks`): tylko operacyjny dashboard — bez linku konfiguracji, modal read-only
- Moduł współdzielony: `frontend/src/modules/consolidation-racks/`; strony OMS: `pages/carts/consolidation-racks/`
- Usunięto: `ConsolidationRackSegmentPanel`, stare strony OMS w `pages/wms/consolidation/`

## P5.10 (poprzedni) — Refaktor UX regałów kompletacyjnych (lista + edytor) (2026-06-08)
- **Frontend-only** — bez zmian DB / API / P5.3–P5.9
- `/carts/racks` — lista tabeli (nazwa, segmenty, wolne/zajęte, %, magazyn; akcje Podgląd→WMS, Edytuj, Usuń)
- `/carts/racks/new` — kreator dwukolumnowy (dane + układ + domyślne wymiary | siatka interaktywna)
- `/carts/racks/:id` — edycja (nazwa regału PUT, segmenty PATCH; układ siatki read-only po utworzeniu)
- Draft overrides segmentów przed POST (klik siatki → panel → `onDraftSave`)
- `/wms/consolidation-racks` — bez zmian (operacyjny dashboard)
- Pliki: `ConsolidationRacksListPage`, `ConsolidationRackEditorPage`, `consolidationRackPanelUtils`; routing `racks/*` w `App.tsx` + `CartsRacks.tsx`
- Usunięto monolityczne `RacksTab` / `RackConfigurator`

## P5.8D — Rack segment config UX (/carts/racks) (2026-06-08)
- Panel boczny po kliknięciu segmentu: nazwa (`slot_label`), wymiary mm, auto pojemność dm³, podgląd skanu RK-XX/nazwa
- Zapis: istniejące `PATCH /racks/segments/{id}/` (bez nowych endpointów)
- Walidacja FE: >0, max 10000 mm; brak wymiarów OK
- Zajęte półki: podgląd dopasowania P5.8C (objętość, %, overflow, estimated warning) + edycja nadal możliwa
- Dashboard regałów: panel read-only; konfigurator: edycja (`readOnly !== true` + `segmentId` + `onSave`)

## P5.8C — Soft capacity-aware shelf allocation (2026-06-08)
- **Bez twardych blokad** — NO_FREE tylko gdy brak wolnych półek (nie przez pojemność)
- Flow: wolne segmenty → capacity score → P5.7 ranking → wybór
- `order_footprint_service.py` — agregacja `ProductFootprint` (plan items / order lines); brak wymiarów → 1 cm³/szt, `dimension_estimated`
- `capacity_scoring_service.py` + `segment_capacity_service.evaluate_capacity_match`
- `allocate_consolidation_shelf(..., order_id=)` — best-fit gdy segment ma capacity; overflow = gorszy score, nie odrzucenie
- UI panel półki: pojemność, objętość zamówienia, wykorzystanie, ostrzeżenia
- Control Tower P5.9: `capacity_warning_count` (overflow + estimated dimensions)
- Tests: `test_consolidation_capacity_allocation.py` (7/7); P5.7 suite bez regresji

## P5.8 prep — Segment profile (names + dimensions) (2026-06-08)
- **Bez zmian P5.7** — alokacja nadal: pierwsza wolna półka wg istniejących reguł
- Model `RackSegment`: `slot_label`, `length_mm`, `width_mm`, `height_mm`, `capacity_dm3` (auto L×W×H)
- SSOT etykiet: `segment_slot_label()` / `format_segment_label()` — custom `slot_label` lub domyślne A1, A2…
- Skan/resolve/staging/packing przez istniejący `lookup_shelf_assignment` (bez zmian algorytmu)
- Adapter slotting: `segment_capacity_service.py` → `LocationCapacityProfile` + `calculate_location_capacity()` (prep only)
- API: `PATCH /racks/segments/{id}/`; migracja w `order_consolidation_schema.py`
- UX: panel półki w `/carts/racks` — nazwa + opcjonalne wymiary
- Tests: `test_consolidation_segment_profile.py` (5/5); P5.7 suite bez regresji

## P5.6A — Consolidation rack UX refactor (2026-06-08)
- Frontend-only: kreator regału (kolumny × rzędy), siatka A1/B2, panel półki, dashboard zajętości
- Mapowanie UX→API: kolumny=ConsolidationRackLevel (name A,B,C), rzędy=RackSegment (segment_index)
- Etykiety zgodne z backend `format_segment_label`: RK-01/A2
- Pliki: `rackLayoutUtils.ts`, `ConsolidationRackGrid`, `ConsolidationRackSegmentPanel`; refactor `RackConfigurator`, `RacksTab`, `ConsolidationRacksDashboardPage`
- Bez migracji DB / bez zmian API / lifecycle bez zmian

## P5.9 — Consolidation control tower (2026-06-08)
- Warstwa operacyjna dla brygadzisty — **read-only**, bez zmian lifecycle / pick / pack / MM
- UI: `/wms/consolidations/control-tower` (link z kolejki konsolidacji)
- API: `GET /wms/consolidation-control-tower/{summary,queues,racks,alerts}`
- Kolejki: READY_FOR_STAGING, STAGING, READY_TO_PACK + TOP 20 bottlenecks
- KPI: liczniki statusów, śr. czasy oczekiwania, zajętość regałów
- SLA: RFS >30/>60, STAGING >4h/>8h, RTTP >30/>60 + alerty DB (P5.2)
- Serwis: `consolidation_control_tower_service.py` (P5.8 rack tower: `control_tower_service.py` — bez zmian)
- Tests: `test_consolidation_control_tower_p59.py` (5/5)

## P5.6 — WMS picking config: consolidation rack mode (2026-06-08)
- Nowy tryb **`consolidation_rack`** („Regał kompletacyjny”) — tylko **zamówienia wieloelementowe** w konfiguracji pickingu
- Walidacja zapisu: wymaga co najmniej jednego regału kompletacyjnego w magazynie; zablokowany dla single-item
- Gating SSOT: `consolidation_rack_picking_active()` = `multi_mode=consolidation_rack` + plan STAGING z przypisaną półką
- Picking: odkład bez koszyka/wózka; kolejka produktów — badge **KONSOLIDACJA** + `shelf_label` (np. RK-01/A2); detail — „Odłóż na …”
- `mark_local_plan_item_picked` tylko przy aktywnym trybie regału; READY_TO_PACK nadal wyłącznie po all items STAGED (P5.4/P5.5)
- Enums: `PickingConfigMode`, `PickingFlowMode`; UI: `WmsSettingsPage` + typy API frontend
- Tests: `test_picking_config_consolidation_rack.py` (5) + deposit suite bez regresji

## P5.8 — Consolidation rack control tower (2026-06-08)
- Warstwa monitoringu dla kierownika/lidera — bez zmian w konsolidacji/MM/pick/pack
- API: `GET /wms/consolidation-racks/control-tower` — zajęte półki + KPI + alerty + brakujące pozycje
- Sort: EXCEPTION → READY_TO_PACK → STAGING; alerty SLA RTTP >30/>60 min, MRR, EXCEPTION + nierozwiązane P5.2
- UI: `/wms/consolidation-racks/control-tower` (link z mapy regałów)
- Tests: `test_consolidation_control_tower.py` (11/11)

## P5.7 — Smart consolidation shelf allocation (2026-06-08)
- Operator nie wybiera półki — `start_consolidation_staging` wywołuje `allocate_consolidation_shelf()` (P5.3–P5.5 bez zmian)
- Kolejność: wolne segmenty → magazyn docelowy planu → regał z aktywnym STAGING → najniższy poziom → opcj. `packing_proximity_rank`/`sort_order` na regale → segment_index
- Brak wolnych: `ConsolidationNoFreeShelfError` / HTTP 409 `{ code: NO_FREE_CONSOLIDATION_SHELF }`; plan pozostaje `READY_FOR_STAGING`
- Dashboard: `summary.remaining_percent` (wolne / łącznie); UI: Wolne półki / Zajęte / Pozostało X%
- Tests: `test_consolidation_shelf_allocation.py` (7) + staging/rack dashboard zaktualizowane

## Consolidation rack dashboard (prior)
- Read-only mapa zajętości regałów kompletacyjnych (bez zmian w flow konsolidacji/MM/pick/pack)
- API: `GET /wms/consolidation-racks/dashboard` — bulk load (racks + orders + plans + items, ≤5 SELECT)
- Stany półki: FREE (zielony), STAGING (niebieski), READY_TO_PACK (pomarańczowy), EXCEPTION (czerwony)
- UI: `/wms/consolidation-racks` — kafel WMS + link z listy konsolidacji
- Tests: `test_consolidation_rack_dashboard.py` (6/6)

## P5.5 — Consolidation shelf packing entry (2026-06-08)
- Wejście do pakowania po skanie półki (np. `RK-01/A2`) — jak koszyk / EAN, bez osobnego flow
- API: `GET /wms/packing/resolve-shelf` → `order_id` + weryfikacja `fulfillment_state == READY_TO_PACK`
- Błąd `SHELF_ORDER_NOT_READY`: „Zamówienie nie jest jeszcze kompletne.”
- UI: fallback po `PRODUCT_NOT_FOUND` na liście zamówień i ekranie pakowania
- Tests: `test_wms_packing_shelf_entry.py` (3)

## P5.4 — Consolidation shelf deposits & packing readiness (2026-06-08)
- **Zasada:** `RECEIVED ≠ STAGED`, `PICKED ≠ STAGED` — odkładanie na półkę tylko po explicit confirm (`stage_plan_item`)
- Nowe statusy pozycji planu: `TO_PICK` (lokalne), `PICKED` (po WMS pick, przed półką); MM bez zmian do `RECEIVED`
- `try_complete_staging` → plan `COMPLETED`, `order.fulfillment_state = READY_TO_PACK`, faza `FULFILLMENT_ASSIGNED` (bez `on_packing_started` — półka zostaje do skanu pakowania)
- Picking: `consolidation_context` + wyjątek `for_picking=True` w `wms_queue_eligibility`; detail API: `consolidation_shelf_label`, `pending_shelf_deposit`
- Packing: blokada kolejki gdy plan nie `COMPLETED`; skan półki → `GET /wms/consolidation-staging/resolve`
- UI: badge Konsolidacja + „Odłóż na RK-01/A2” w pickingu; postęp MM/lokalne + READY_TO_PACK na szczególe planu; skan półki w pakowaniu
- Tests: `test_consolidation_deposits.py` (10) + pełny pakiet konsolidacji **40/40**

## P5.2 — Consolidation exceptions & recovery (2026-06-08)
- Statusy pozycji: SHORTAGE, DAMAGED, LOST, BLOCKED
- Statusy planu: EXCEPTION, MANUAL_REVIEW_REQUIRED (+ istniejące)
- Tabela: `order_consolidation_alerts` (severity, code, message, resolved)
- Auto-sync MM przyjęcia: brak → SHORTAGE + alert; uszkodzenie (`stock_disposition` / DAMAGED) → DAMAGED + plan EXCEPTION
- API: `POST /consolidation-plans/{id}/change-target-warehouse`, `/cancel`, `/items/{id}/recovery`; `GET /wms/consolidation-alerts`
- Faza zamówienia: `MANUAL_REVIEW_REQUIRED` po anulowaniu; blokada wave/pick/pack przez fazę + status planu (EXCEPTION/MANUAL_REVIEW/CANCELLED)
- UI: zakładka Alerty w Konsolidacjach, recovery na szczególe, liczniki problemów na pulpicie/launcherze
- Tests: `test_consolidation_exceptions.py` (9) + P5/P5.1 = **21/21**

## P5.1 — WMS consolidation operations (2026-06-08)
- WMS moduł **Konsolidacje** (`/wms/consolidations`) — lista + szczegół planu (magazyn docelowy)
- API: `GET /wms/consolidation-plans`, `GET /wms/consolidation-plans/{id}`, `GET /wms/consolidation-plans/summary`
- Auto-sync MM → `IN_TRANSIT` / `RECEIVED` → plan `COMPLETED` → `order.phase = FULFILLMENT_ASSIGNED`
- Blokada pick/pack/wave: `wms_queue_consolidation_phase_clauses()` w kolejkach WMS
- UI: kafel WMS menu (liczniki), widget na pulpicie Operacje, OMS panel postęp + „Oczekujemy na”
- Tests: `test_wms_consolidation_operations.py` (5) + P5 foundation (7) = 12/12

## P5 — Consolidation fulfillment foundation (2026-06-08)
- **`tenant_fulfillment_configurations.consolidation_warehouse_id`** (nullable) — preferowany magazyn konsolidacyjny
- Tabele: **`order_consolidation_plans`**, **`order_consolidation_plan_items`**
- Fazy: **`CONSOLIDATION_REQUIRED`**, **`CONSOLIDATING`** (między FULFILLMENT_ASSIGNED a WAVE_CREATED)
- SSOT: `order_consolidation/feasibility_service.py`, `plan_service.py`
- API: `POST /orders/{id}/generate-consolidation-plan`, `GET /orders/{id}/consolidation-plan`, `GET /orders/{id}/consolidation-feasibility`, `POST /consolidation-plans/{id}/generate-mm-drafts`
- UI: `OrderConsolidationPanel` na karcie zamówienia; Ustawienia → magazyn konsolidacyjny
- Fala: zamówienia w fazach konsolidacji wykluczone z `create_wave`
- Tests: `backend/tests/order_consolidation/test_order_consolidation.py` (7/7)
- **Bez zmian:** split shipment, auto-MM execution, ATP sourcing, network reservations

## P4 — Multi-warehouse UI (2026-06-08)
- Karta produktu (Magazyn): sekcje Stany magazynowe + Plan rozmieszczenia (read-only)
- Lista produktów: kolumna Stan sieciowy (domyślnie) + dynamiczne kolumny per magazyn (konfigurator)
- Karta zamówienia: panel magazynu + meta audytu + tabela historii
- Dashboard: sekcja Sieć magazynów
- MM: Z magazynu / Do magazynu (source/destination_warehouse)
- Nośniki: kolumna Magazyn + current_warehouse_name
- API: GET product warehouse-stock-breakdown, slotting-by-warehouse; GET order fulfillment-assignment-audits; GET tenant warehouse-network-stock; list products include_network_stock / include_warehouse_stocks
- **Bez zmian:** auto-sourcing, split fulfillment, ATP routing, network reservations

## P3 — Fulfillment lifecycle (2026-06-08)
- **`orders.fulfillment_assignment_phase`**: UNASSIGNED | FULFILLMENT_ASSIGNED | WAVE_CREATED | PICKING | PACKING | SHIPPED (default FULFILLMENT_ASSIGNED dla istniejących)
- SSOT: `order_fulfillment_lifecycle_service.py` — initial assign, manual assign, phase advance, import lock
- Audyt: `order_fulfillment_assignment_audits` (strategy, assigned_by_user_id, reason — bez JSON)
- API: `POST /orders/{id}/assign-warehouse` (warehouse_id, reason)
- Hooki: create/import → `apply_initial_fulfillment_assignment`; wave → WAVE_CREATED; pick/pack/ship → fazy
- Import (P3.7): od FULFILLMENT_ASSIGNED nie nadpisuje warehouse_id / phase
- UI: `OrderFulfillmentWarehousePanel` na karcie zamówienia (magazyn + badge fazy + „Przypisz magazyn” gdy UNASSIGNED)
- Schema: `order_fulfillment_lifecycle_schema.ensure_order_fulfillment_lifecycle_schema`
- Tests: `backend/tests/order_fulfillment/test_fulfillment_lifecycle.py` (9/9) + P2.5 (5/5)
- **TODO:** superadmin force override endpoint
- **Bez zmian:** split fulfillment, auto-sourcing ATP, multi-WH allocation, network reservations

## P2.5 — Fulfillment assignment configuration (2026-06-08)
- Tabela **`tenant_fulfillment_configurations`**: `fulfillment_assignment_mode` (MANUAL | DEFAULT_WAREHOUSE | FULFILLMENT_PRIORITY | AUTO_ATP_FUTURE)
- SSOT resolver: `fulfillment_assignment_resolver.resolve_initial_fulfillment_warehouse()` — bez ATP
- API: `GET/PATCH /company/fulfillment-configuration?tenant_id=`
- UI: Ustawienia → Firma → Magazyny → Realizacja zamówień
- Tests: `backend/tests/fulfillment_configuration/test_fulfillment_assignment.py` (5/5)
- **Bez zmian:** Order lifecycle, Wave, audit P3, auto-sourcing

## P2 — Warehouse ownership model (2026-06-08)
- Schema: `backend/db/wms_warehouse_ownership_schema.py` — startup via `main.py`
- **PickTask:** `warehouse_id` NOT NULL (model); DB column nullable + backfill location→order
- **Carriers:** `current_warehouse_id` (mobile); sync on create/patch/move (`wms_carrier_service`)
- **StockDocument:** `source_warehouse_id` / `destination_warehouse_id` (MM); ORM `before_insert` guard + factory validation
- **CartBasket:** `warehouse_id` NOT NULL; backfill from cart
- SSOT helpers: `wms_warehouse_ownership_service.py`
- Tests: `backend/tests/wms/test_warehouse_ownership.py` (5/5)
- **Bez zmian:** OMS, sourcing, split fulfillment, UI

## Multi-WH product slotting (2026-06-08)
- SSOT: tabela **`product_warehouse_slotting`** `(product_id, warehouse_id, location_uuid)` UNIQUE
- Backfill: `products.assigned_locations` → slotting (UUID → warehouse_id); startup + `python -m backend.scripts.backfill_product_warehouse_slotting`
- API: `GET/PUT /products/{id}/slotting?warehouse_id=`; bulk `GET /products/slotting?warehouse_id=`
- Lista produktów z `warehouse_id` → `assigned_locations` z tabeli (slice per magazyn)
- Designer + import/export CSV → PUT slotting per magazyn (nie nadpisuje innych WH)
- Schema: `product_warehouse_slotting_schema.ensure_product_warehouse_slotting_schema`
- Tests: `backend/tests/product_warehouse_slotting/test_product_warehouse_slotting.py`
- **Wave location_clustering (2026-06-08):** `_get_order_locations_sets` → `product_warehouse_slotting` scoped by `wave.warehouse_id`; legacy JSON fallback tylko gdy brak wierszy slottingu dla (product, WH) i flaga `WAVE_CLUSTERING_LEGACY_ASSIGNED_LOCATIONS_FALLBACK=true` (default)
- Tests wave: `backend/tests/wave/test_wave_location_clustering_slotting.py`
- **Bez zmian:** inventory sync, Pick task allocation (inventory FEFO), WZ, OMS, sourcing

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
