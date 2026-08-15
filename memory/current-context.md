**Produkcja v1 = PASS E2E (zamknięta 2026-08-15).** Nie ruszać lifecycle bez osobnego powodu.

**v1.1 follow-upy (tylko zapis, bez implementacji):** `memory/production-v1.1-followups.md`
1. BAT CTA „Rozpocznij zbieranie” — deep-link bez `start-collecting` (vs `openJob`)
2. BAT completed — nie pokazuj „Materiały nie są jeszcze zarezerwowane” po RW

**UAT BAT control PASS E2E — Produkcja v1 PASS E2E (2026-08-15):**
- Fresh **BAT/2026/0017** id=17 / 75894×1 / BOM#8; release→collecting→RW **#98** (−3 comp)→prod 1/1→PW **#99**→WMS putaway A1-A-1→**completed**
- Brak packing; 1×RW/1×PW; znika z Zleceń; w Historii PARTIA; szczegóły OK

**UAT PLANNING auto-replenishment PASS E2E (2026-08-15):**
- Config: auto ON, coverage=1d, interval=hourly; scheduler tick utworzył MO
- Produkt **75894** / id=383 / BOM#8 (comp 182×3); need = 0.0333→**0.03** (target−on_hand−free_pipeline); ORDERS pipeline nie obniża need
- **MO/2026/0022** id=24 `source_type=PLANNING` qty=0.03; 2./3. run → created=0, brak bump/duplikatu
- Soft-hold ORDERS: brak open ORDERS MO dla SKU (order_demand=1 bez MO) — path nieadversarial; PLANNING bez order_sources
- Lifecycle: planned→release→collecting→RW **#96**→production→`awaiting_putaway`→PW **#97**→WMS putaway A1-A-1→finalize→**completed**; packing_handoff=null; brak BAT
- Config zostawiony ON (hourly / 1d) na prod tenant1/wh1

**UAT PRINT PASS E2E (2026-08-15):**
- Config #9 chwilowo PRINT (potem restored WMS); MO **MO/2026/0021** / id=23 / ORDERS #1256
- Preview PDF side-effect free; start → `execution_interface=PRINT`, RW **#94** once, ST-003 A1 −2; double-start idempotent
- Reprint PDF bez RW/consume; progress 0.5→1 in_progress; finish → completed; FG buffer DOCK-IN (+1); PW#95 putaway/relocation DONE, **nie** w kolejce rozlokowania; source#22 fulfilled; order → **Pakowanie#8**
- resolve-scan number/id OK; finish retry 400; config restored WMS

**UAT A clean retest po 97321395 — PASS E2E (2026-08-15):**
- Cleanup: withdraw UAT leftovers 1266/1267/1269 (Produkcja→Nowe); MO cancel cascade; MM free B1→DOCK; brak PRODUCTION_ORDER ST-003; pickableFree=0
- Fresh **#1256 / id=1270** / SourceItem **#22** / PZ **#91**
- DOCK-only ST-003×2: BRAKI, shortage, allocatable=0, brak AUTO_RESUMED
- Putaway ×2 → A1-A-1: reattach #22 reserved, PRODUCTION_ORDER **#82×2**, materials_reserved=true, Produkcja#12, AUTO_RESUMED×1 (MO/2026/0021)
- Idempotencja (MM notify roundtrip): nadal 1× AUTO_RESUMED, ta sama res #82, planned=1
- Poprzedni #1255: DOCK REGRESSION PASS / PUTAWAY RETRY NOT VALID (ENV CONTAMINATED) — nie FAIL kodu

**UAT A po 97321395 — STOP KROK 2 (2026-08-15) — ENV CONTAMINATED (nie FAIL kodu):**
- Order **#1255 / id=1269** / SourceItem **#21**; PZ **#89** ST-003×2
- KROK1 DOCK-only: PASS — BRAKI, shortage, allocatable≈0, brak AUTO_RESUMED, brak PRODUCTION_ORDER
- KROK2 putaway: analysis available=2 vs MO demand 4 (leftover sources #19/#20) → NOT VALID
- STOP — bez PRINT/PLANNING/BAT; bez kodu

**Fix materials ATP + Phase 8 reserved semantics (2026-08-15) — 97321395:**
- SSOT: `production_allocatable_qty` (= allocate eligibility; DOCK wykluczony przy putaway)
- `component_stock_breakdown.available_qty` z allocatable, nie warehouse_on_hand
- material validation: reserved dopiero po `REFRESHED`+`materials_reserved`; fail → shortage/BRAKI
- AUTO_RESUMED tylko przy source `reserved` AND `materials_reserved=true`
- Testy: `test_production_material_allocatable_phase8.py`

**Diagnoza materials po Phase 8 (2026-08-15) — bez fixa:**
- Root: asymetria ATP — `analyze_composition_quantity`/`warehouse_on_hand` liczy DOCK; `allocate_product_quantity` wyklucza DOCK (`requires_putaway`)
- `apply_material_validation`: source→`reserved` **przed** `refresh`; przy `ValueError` w allocate → `RESERVE_FAILED` / `materials_reserved=false`, source zostaje `reserved`
- Phase 8 `AUTO_RESUMED` tylko gdy ACTIVE source — **nie** sprawdza `materials_reserved`
- Case #1253: planned=2 → need ST-003×4; dock w analizie; pickable zablokowane → brak PRODUCTION_ORDER

**UAT A Phase 8 retest po 958fdb19 — STOP (2026-08-15):**
- Order **#1253 / id=1267** / item 2122 / ST-001×1; SourceItem **#20**
- KROK1: BRAKI#4 PASS; brak nadpisania awaiting; MO/8 agregacja; source#20 shortage
- KROK2/3: PZ#88 receive/putaway ST-003 → AUTO_RESUMED; **same #20** reserved; reattached; Produkcja#12
- **FAIL:** `materials_reserved=false`; brak PRODUCTION_ORDER reservation ST-003×2 (tylko obce SALES_ORDER #72/#73)
- Idempotencja częściowa: 2. notify (putaway) bez 2. AUTO_RESUMED
- STOP — bez PRINT/PLANNING/BAT

**Fix Phase 8 vs gate (958fdb19) — 2026-08-15:**
- BRAKI wygrywa nad awaiting po ALL_SHORTAGE
- Reattach shortage SourceItem z cancelled MO (jeden demand)
- Testy collision UAT #1266 PASS; 89 related tests PASS
- Po deploy: ponów tylko UAT A Phase 8 (bez PRINT)

**UAT v1 domknięcie STOP na Phase 8 (2026-08-15):**
- Case #1266 / item 2121 / ST-001 BOM ST-003×2
- PRE: source#18 shortage, MO/7 cancelled ALL_SHORTAGE; gate nadpisał BRAKI→awaiting#13 (activity 476 mówi BRAKI)
- P8 notify ST-003+2: RESTORED → source#19 reserved na MO/8, UI Produkcja#12, res#69×2, activity AUTO_RESUMED
- **FAIL:** leftover SourceItem#18 nadal `shortage` (duplikat obok #19 reserved)
- STOP — bez UAT B/C/D

**Audyt Produkcja v1 (2026-08-15, read-only):**
- Werdykt: gotowa do normalnego użycia ścieżki ORDERS+WMS (Fazy 1–3 PASS E2E) + BAT lifecycle; bez hard blockerów kodu
- Warunek ops: `FEATURE_PICKING_ENTRY_READINESS_MODE=active` + poprawny Konfigurator (awaiting, buffer, after)
- Follow-up: BAT/MO UX, ERP/PAPER clutter, logi pełne na karcie, UAT PLANNING/PRINT, Analiza KPI
- Nie ruszać: gate/ATP/SALES_ORDER/Phase3 detach/allocator/buffer ORDERS

## Active

**Production ERP UX rebuild (frontend only, 2026-08-15) — DONE lokalnie, bez commit/push:**
- Pulpit / Zlecenia / Planowanie / Receptury / Materiały / Historia / Analiza kosztów
- SSOT CTA/statusów bez zmian (`productionOperationalState`); backend lifecycle nietknięty
- Nowe thin: `ProductionProgressCell`, `ProductionSourceTypeBadge`
- Usunięte fake KPI („—”, marża, średni czas, efficiency na Analizie)
- `tsc` + `npm run build` OK; widoczne po deploy FE / local Vite

**Produkcja v1 = PASS E2E (zamknięta 2026-08-15).** Nie ruszać lifecycle bez osobnego powodu.
- Legacy #1251 = stary stan sprzed fixa (nie regresja detacha); allocator SAFE (source#15 `shortage` poza fulfillable)
- Historical SO overbook: B3-C-2 (#65), B3-B-3 (#54) released via reservation service; po cleanup true SO overbook=0
- Fresh #1252 / MO/6: collecting → external +1 B3-A-4 → SOURCE_DETACHED_STARTED_MO; UI→Wózki#6; SALES#68; planned=1; finish MO → free FG @ DOCK-IN; brak FE_PICK/pick alloc
- **Fazy 1–3 readiness/production fallback = PASS E2E**

**Fix P0/P1 (fa704be5) — wdrożone na prod:**
1. `exclude_production_order_id` — własna PRODUCTION_ORDER nie blokuje collecting
2. `pickable_free_capacity_*` — nowe SALES_ORDER bez overbook
3. Started MO + full external FG → SourceItem `cancelled` (detach) bez shrink planned/RW/mats
4. `allocate_produced_delta` — remaining demand → free FG
5. MO finish collecting: committed slices (bez double-consume)

**UAT started MO — PARTIAL (przed fixem):**
- Finish MO BLOCKED: własna res MO traktowana jak obca (P0.1)
- Overbook B3-C-2 (P0.2); ryzyko double fulfill (P1)

**UAT partial shrink 2→1 PASS (#1249 / id=1262) — 2026-08-15:**
- PRE: awaiting, source#13 shortage req=2, SALES=0, freeATP=0, MO/4 planned/draft
- EVENT: putaway +1 ST-001 → B3-C-2 (nie BUFFER)
- POST: res #62=1, req=1, status=shortage, awaiting, DEMAND_REDUCED #505, planned=5 (ACTIVE-only SSOT)
- #1248 = FULL COVER PASS (nie dowód fail partial)
- **Next:** UAT started MO (w toku / blocked finish)

**UAT Faza 3 resume po 51549091 — #1248 FULL COVER (2026-08-15):**
- Deploy Active: *Napraw redukcję… przy shortage*
- #1248 miał już res=1; +1 pickable → full cover → cancelled / Wózki / DEMAND_CANCELLED
- Przeklasyfikowane: FULL COVER RECONCILIATION PASS (nie fail partial 2→1)

**Fix Phase 3 shortage shrink (2026-08-15):**
- Root: `shortage` poza ACTIVE → reduce nie znajdował SourceItem (#1248 UAT)
- `PRODUCTION_ORDER_SOURCE_ITEM_RECONCILABLE_DEMAND_STATUSES` (+shortage) tylko dla Phase 3 / reduce
- ACTIVE bez zmian (trigger idempotency / material allocation)
- Partial shrink: requested 2→1, status zostaje shortage; planned tylko z ACTIVE

**UAT Faza 3 edge — STOP (2026-08-15):**
- A BLOCKED_MIXED #1246: A-only PASS; full READY PASS
- B FG3 #1247/#1248: alloc 2+1 PASS, no overbook PASS, priority PASS
- **FAIL PARTIAL SHRINK:** #1248 SourceItem status=`shortage` → `requested_quantity` zostało **2** (oczekiwane 1); brak DEMAND_REDUCED. Root: ACTIVE_STATUSES bez `shortage`.
- C STARTED MO: **nie uruchomione** (STOP)

**UAT Faza 3 podstawowy — PASS (2026-08-15) na #1245/id=1258:**
- Event: MM putaway DOCK-IN→B3-B-1 (+1 ST-001), reason `mm_putaway` (nie kończono MO)
- Auto: reservation #43 qty1; source #9 cancelled; MO planned 4→3; status → Wózki#6; GATE_READY; w kolejce picking multi
- Brak kradzieży: sales193 #37=7, #39=3; B #41=1
- Activity: DEMAND_CANCELLED + RETURNED_TO_PICKING (PL, bez enumów)
- Idempotencja: ponowny mm_putaway (buffer B3-A-5) → #1245 bez zmian / bez duplikatów
- **STOP** — bez production fulfillment / started MO / BLOCKED_MIXED / multi-order FG3

**Faza 3 FG availability retry (2026-08-15):**
- Notify Phase 8 → także `on_fg_availability_increased`
- Awaiting orders: full-order re-gate → reserve FG → reduce/cancel draft MO → `return_picking_status_id`
- Started MO (collecting/in_progress) bez shrink; BLOCKED_MIXED bez return
- SALES_ORDER release emituje availability notify
- Testy: `test_picking_entry_availability_retry_phase3.py`

**UAT Faza 2 — KROK 4/5 PASS (2026-08-15):**
- #1245 Logi: czerwony blocker z ST-001 qty + MO/2026/0004; bez enumów
- Idempotencja: re-entry status→Wózki#6 → z powrotem awaiting; planned=4; 1 SourceItem; sales193 nadal 7+3; brak duplikatów eventów 473/474
- **Faza 2 UAT = PASS** — wolno startować Fazę 3

**UAT Faza 2 — środowisko (2026-08-15):**
- Status **Oczekuje na produkcję** id=13; ProductionConfig #9 awaiting=13
- Railway: `FEATURE_PICKING_ENTRY_READINESS_MODE=active`
- Zamówienia: #1243/#1244/#1245; ST-001 ATP B3-C-1 reserved=10; MO `MO/2026/0004` planned=4

**Faza 2 picking-entry gate (2026-08-14):**
- `FEATURE_PICKING_ENTRY_READINESS_MODE=off|dry_run|active` (domyślnie off; legacy DRY_RUN=1 → dry_run)
- Active: reserve FG + MO missing-only + `status_awaiting_production_id`
- Snapshot powrotu: `import_metadata_json.return_picking_status_id`
- **Nie** wdrażać Fazy 3 (auto retry / powrót awaiting→picking / shrink MO)

**Faza 1 readiness + SALES_ORDER↔picking (2026-08-14):**
- SSOT: `backend/services/wms_picking_atp.py`
- Reserve API: `sales_order_fg_reservation_service` (jeszcze bez auto z gate)
- Dry-run: `FEATURE_PICKING_ENTRY_READINESS_DRY_RUN=1` → log `[picking_entry_readiness]`
- **Nie** wdrażać jeszcze Fazy 2 (MO / awaiting / allocate flag)

**Konfigurator produkcji WMS (2026-08-14):**
- SSOT odczytu/zapisu: `production_config_query` / `production_config_service`
- API: `/wms/settings/production-configs`
- Storage: `picking_config` + `is_production_mode` (bez osobnej tabeli — FK MO)
- UI: Ustawienia WMS → Produkcja → Konfigurator produkcji; zbieranie bez trybu produkcji

**Ujednolicona historia Activity Log — Zwroty + Produkcja (2026-08-14):**
- Helper `record_domain_activity` + correlation_id idempotency (jeden event, wiele linków)
- Zwroty: CREATE/DECISION/INTAKE/RECOVERY/SCRAP/Z-PZ/PUTAWAY/FINALIZED z actor
- Produkcja milestones: RELEASED…COMPLETED (+ RW/PW); bez duplikacji PRODUCTION_ORDER_*
- FE: RMZ Dziennik → ActivityLogPanel `return`; Order/Product istniejące panele; MO detail timeline

**FIX UAT blocker STOCK DISASSEMBLE Z-PZ (2026-08-14):** `_any_planned_lines` nie widziało accepted `ReturnLineBundleComponent` przy FG=0 → ensure skip → finalize zamykał RMZ bez dokumentu. Gate + `ensure_required_*` + assert przed transition.

**STOCK bundle disassemble on return (2026-08-14):** FG vs Rozmontuj; snapshot `OrderLineBundleComponent`; MIXED fg+dq; shared Z-PZ emission untouched.


**Wspólna emisja Z-PZ odzysku komponentów (2026-08-14):** commit `8157f91e` — `ComponentReturnRecoveryLine` + adapters + `append_accepted_component_lines`; bez migracji modeli.

**P1 produkcji domknięte (2026-08-14):** commit `e96b749d` — KPI braków = SSOT kolejki Materiałów; etap ≠ Opóźnione; planowanie formula; polish Materiały/Zlecenia/Pulpit.

**FIX: bom_preview null name/sku na RMZ (2026-08-13):**
- Root cause: `bom_preview_for_product` enrichował name/sku, `_rmz_line_to_read` nie przekazywał do `WmsBomPreviewComponentRead`
- FE panel pokazuje nazwę + SKU; fallback `#id` tylko gdy brak danych
- returns tests 53 passed; FE build OK

**UX PLAN (no impl): Moduł Produkcja — przegląd widoków (2026-08-13):**
- Role ekranów: Pulpit=attention, Zlecenia=in progress, Planowanie=what to make, Receptury=BOM, Materiały=blockers, Historia=done, Analiza=costs
- Kluczowe luki: Pulpit ≈ Zlecenia; Materiały `missing_qty=0` nadal w kolejce + agregacja `max` zamiast sumy; Analiza „Koszt materiałów”=Σ(koszt receptury×stan FG), „Efektywność”=finished_today/workload; Historia bez czasu realizacji w API summary
- Szczegóły planu w rozmowie — bez FE/BE implementacji

**IMPL: Odzysk komponentów przy zwrocie FG (2026-08-13):**
- Settings: `manufactured_component_recovery_mode` OFF|OPTIONAL|REQUIRED; receipt STANDARD_PUTAWAY|DEFAULT_LOCATION + location_id
- RMZLine: `stock_intake_mode` FG|DISASSEMBLE|MIXED; `fg_intake_qty` + `disassembly_qty`
- Table `rmz_line_component_recoveries` (BOM snapshot); expected = line.qty × disassembly (no waste)
- Z-PZ: FG via fg_intake_qty; components accepted_qty>0; scrap audit-only
- Bundle flow precedence; commercial REJECTED ≠ block recovery; FG posted locks later disassemble
- Service: `returns/manufactured_component_recovery_service.py`; FE: settings + `ManufacturedRecoveryIntakePanel`
- Tests returns/ 52 passed; FE build OK

**DESIGN (no impl): Odzysk komponentów przy zwrocie FG (2026-08-13):**
- Settings: WMS→Zwroty sekcja „Produkty produkowane”; mode OFF|OPTIONAL|REQUIRED; receipt STANDARD_PUTAWAY|DEFAULT_LOCATION; scrap = NO_STOCK_HISTORY_ONLY (MVP)
- SSOT BOM: `get_active_manufacturing_composition` + `calculate_required_components` (qty+waste/yield)
- Stock: Z-PZ multi-line komponentów (nie PW); reuse receipt/putaway/return-link; wzorzec jak bundle components, osobna tabela recovery
- Handel ≠ magazyn; po poście FG disassemble zabronione (MVP)

**FIX: MO ORDERS READY_TO_PACK vs packing (2026-08-13):**
- BE: `source_awaiting_packing_order_count` (projekcja z fulfilled sources + `order_awaits_packing_after_orders_production`)
- FE: READY_TO_PACK / aktywna lista / CTA packing tylko gdy awaiting > 0; fulfilled ≠ packing
- MO lifecycle `completed` bez zmian; po Spakowane/DONE/SHIPPED → COMPLETED / bucket done / brak CTA

**UAT 3 ORDERS — FOR UPDATE fix (2026-08-13):**
- `_find_aggregable_mo`: lock bez joinedload; selectinload po FOR UPDATE
- Po deploy: wznowić KROK 1 na czystym Nowe ST-001 (np. #1022) albo wycofać #1092 z Produkcja→Nowe i ponownie →Produkcja

**UAT 3 ORDERS — KROK 1 wynik (2026-08-13):**
- Kandydat: **#1092** (Nowe→Produkcja), product **193** ST-001, composition **5**, qty **1**, komponent 192 ST-003 avail 12 / need 2, max_producible=6
- Config Produkcja id=12 / picking_config id=9: is_production_mode=true, buffer DOCK-IN, after=OPEN_PACKING, shortage→BRAKI(4), scope=SINGLE_ELEMENT — OK
- PATCH ui-status → **200**, status zostaje **Produkcja**, brak BAT, brak 500
- **MO NIE powstało** — soft-fail savepoint: `FeatureNotSupported: FOR UPDATE cannot be applied to the nullable side of an outer join` przy `_find_aggregable_mo` (FOR UPDATE + LEFT JOIN line_snapshots)
- Kolejne czyste Nowe ST-001 qty1: 1022, 917, 862, 832… (po naprawie FOR UPDATE)

**UAT 3 ORDERS — FIX deployed path (2026-08-13):**
- Production hook: SAVEPOINT soft-fail (nie truuje PATCH statusu)
- #1158: `shipping_method_id=NULL` (OK); label DHL zachowany
- Produkt 350 (ST-002): **brak** aktywnej manufacturing composition → blocker UAT przed happy-path MO (nie tworzyć BOM bez polecenia)
- Po deploy: można wznowić Nowe→Produkcja tylko po zapewnieniu BOM; bez BOM oczekiwane przejście do `status_on_component_shortage` (nie 500)

**UAT 3 ORDERS — STOP KROK 1 (2026-08-13):**
- Config OK: status Produkcja (id=12) ma `is_production_mode=true`, buffer DOCK-IN, after=`OPEN_PACKING` (nie STATUS_ONLY)
- PATCH #1158 → Produkcja: HTTP 500 `request_id=5216823b20b84514b4f8b9c7f731c09b` @ 19:38:08 GMT+2
- **DIAG confirmed (Railway):** `PendingRollbackError` po `IntegrityError` / `ForeignKeyViolation` `orders_shipping_method_id_fkey` — order 1158 ma `shipping_method_id=59379f8b-…` nieobecny w `shipping_methods`
- Ścieżka: `_enter_production` → **NO BOM** → `_move_order_to_shortage_status` (`order_ui_status_id=4`) → `_log_order` `begin_nested` flush → UPDATE orders pada na orphan FK → sesja failed → soft-fail trigger zostawia poison → `db.commit()` w `patch_order_ui_status` = 500
- Nie: material validation / reservation / create MO / commit logic per se — **schema/constraint + brak savepoint + NO_BOM mutuje order**
- Kandydaci UAT: #1158 (ST-002), #1152 (ST-003) — nadal Nowe; naprawa dopiero na życzenie

**Completed CTA „Zobacz szczegóły” (2026-08-13):**
- Na detailu BAT/MO completed: brak martwego CTA (`primaryAction.kind=none`) — użytkownik już jest na końcowym detailu
- Z listy/pulpitu: `view_details` → `/production/batch/:id` lub `/production/orders/:id` (bez mieszania BAT/MO)
- ORDERS completed+fulfilled: nadal „Przejdź do pakowania” także na detailu

**ProductionBatch → jedno PW (2026-08-13):**
- finish-production tworzy 1 dokument PW z N pozycjami FG (nie PW per produkt)
- Link: `StockDocument.production_batch_id` + wszystkie linie `pw_stock_document_id` → ten sam PW
- Rozlokowanie: standardowy multi-line putaway; BAT completed dopiero po DONE całego PW
- Bez migracji historycznych multi-PW (np. PW/6 + PW/7 dla BAT/0016)

**WMS collection multi-location (2026-08-13):**
- `pick_events[]` per lokalizacja; qty edytowalna; discrepancy + inventory write-down; modal braku
- finish RW z historii lokalizacji; shortage_reported zamyka komponent niepełny

**WMS BAT finish-collecting / confirm pick (2026-08-13):**
- Confirm WMS = inventory commit (`picked_slices`); finish-collecting = RW only (no re-pick / no double-consume)
- Legacy JSON-only GOTOWE cleared on GET `/collection` until re-confirm
- Business 409 → WmsMessageModal on production terminal

**UAT Produkcja — ryzyka A/C/D (2026-08-13):**
- A: lista Zleceń zostawia completed ORDERS z `source_fulfilled_order_count > 0` jako READY_TO_PACK
- C: copy braków z `lines[].missing` + nazwa (`Brakuje N szt. — … + M kolejnych`)
- D: planned przed release = „Przekaż do realizacji”; po release = „Pobierz komponenty” / „Rozpocznij zbieranie”
- E (bez naprawy): BAT i MO to osobne encje bez wspólnego FK — UI może pokazać obie przy równoległym utworzeniu; brak jednoznacznego klucza procesu

**UX Produkcja — kolejka pracy + getProductionOperationalState (2026-08-13):**
- FE SSOT: `productionOperationalState.ts` → currentStep / description / CTA / progressMeaning / exclusive dashboardBucket
- Pulpit: Wymaga reakcji | Do wykonania | W toku (bez dublowania pozycji)
- Planowanie: usunięto „Aktywne partie”; zostaje rekomendacja „co wyprodukować”
- Putaway terminal: „Rozlokuj produkt”, bez raw NOT_STARTED / „dokument PW” jako główny komunikat
- ORDERS nadal omija Rozlokowanie (BE `complete_orders_mo_without_putaway` + FE `ordersMoSkipsPutaway`)

**UX pass Produkcja — jedna akcja „Co dalej?” (2026-08-13):**
- SSOT: `frontend/src/pages/Production/productionNextAction.ts` (+ `ProductionPrimaryActionBar` / `ProductionContextBanner`)
- Pulpit: attention + in-progress first; lista/detail bez równorzędnych CTA etapów
- Materiały hub: `/production/materials/{shortages|reservations|analysis}`
- Bez zmian backendu Faz 1–9

**Phase 9 — real auto stock replenishment scheduler (2026-08-13):**
- Shared `operational_workers_loop` daemon (Railway single process; no Celery) ticks existing workers + production replenishment
- Settings in `production_forecast_json`: `stock_replenishment_interval` (hourly/3h/6h/daily), `last_replenishment_run_at`
- Job calls existing `run_production_stock_replenishment`; ORDERS shortage retry + soft-hold before PLANNING
- Concurrency: PG advisory lock + `uq_prod_order_planning_open_agg`; pipeline idempotency

**Phase 8 — auto shortage retry on component availability (2026-08-13):**
- Central: `on_component_availability_increased` → same `retry_order_driven_production_shortages` as manual
- Candidates narrowed via BOM `ProductionOrderLineSnapshot.component_product_id` (no new table)
- Hooks: reservation release (coalesced), PZ dock (when ATP), putaway, inventory PW+, MO cancel (after status=cancelled)
- Partial + priority via existing material allocation; restore via `apply_order_panel_ui_status` to MO’s `production_source_status_id`
- Suppress notify during mid-refresh / ALL_SHORTAGE MO collapse; advisory lock + source idempotency

**Pipeline + soft-hold + fulfilled re-entry (2026-08-13):**
- Free-stock pipeline (PLANNING/MANUAL/batches) vs order-driven (ORDERS) — nadprodukcja używa tylko free-stock
- Trigger: `ALREADY_FULFILLED` + outstanding = order_qty − historical fulfilled (delta przy wzroście qty)
- Soft-hold: `max(0, ORDERS component need − active reservations)` per komponent; bez double-count

**Krytyczne regresje UX produkcji (2026-08-13) — audyt B.1/B.2/C.1:**
- Terminal WMS: catch + PL toast; sync mutation lock (ref) na +1 / finish collecting / finish production
- ORDERS finish: brak navigate do putaway; toast bufora; MANUAL/PLANNING bez zmian
- Count ≠ qty: API `source_reserved_quantity_total` / `source_shortage_quantity_total`; lista/detail rozdzielone

**UX produkcji i planowania (2026-08-12):**
- Lista/detail MO: język biznesowy (Z zamówień / Na magazyn, statusy PL, gotowość materiałów)
- Planowanie: rozbicie Zamówienia vs Uzupełnienie; Przelicz vs Utwórz zlecenia; coverage tiles
- Konfigurator: sekcja Tryb produkcji + walidacje pól; terminal: Pobierz komponenty

**Stock replenishment / nadprodukcja (2026-08-12) — Phase 7:**
- Settings in `production_forecast_json`: `auto_stock_replenishment`, `stock_replenishment_coverage_days` (1|3|7|14)
- `run_production_stock_replenishment` creates/aggregates `ProductionOrder` `source_type=PLANNING` only
- ORDERS material reservations + soft-hold before PLANNING; no FG buffer copy; standard PW/putaway
- Manual API `POST /production/planning/stock-replenishment/run`; no cron yet

**Order-driven production → packing handoff (2026-08-12) — Phase 6:**
- `after_production_action` = `STATUS_ONLY` (default) | `OPEN_PACKING` on picking_config
- Stronger `status_after` validation: ≠ source, ≠ other production source, ≠ standard picking entry, unique among production afters; target forced = after (packing queue)
- On source fulfill: `READY_TO_PACK` + `CARTLESS` + status_after; progress returns `packing_handoff` for operator FE toast/navigate
- Packing finish consumes FG buffer inventory (idempotent); optional badge `from_production` / „Z produkcji”
- No new packing module / courier / overproduction

**Order-driven production print execution (2026-08-12) — Phase 5:**
- `picking_config.production_execution_method` = `WMS` | `PRINT` (per production status; default WMS)
- PRINT = alternate *interface* for ORDERS MO (same lifecycle); PDF preview side-effect free
- `POST .../start-print-execution` → lock reservations + existing RW consume path; idempotent restart
- PDF: components with per-location allocations, source orders + flame, MO barcode scan
- `GET .../orders/resolve-scan` + WMS production terminal scan → open existing execution UI
- FE: badge Wydruk/Terminal WMS; Podgląd vs Wydrukuj i rozpocznij + confirm modal

**Order-driven production → packing (2026-08-12) — Phase 4:**
- Progress +N: allocate to sources (same priority sort as Phase 3) → `fulfilled` → `status_after_production_id` via SSOT (`skip_production_trigger`)
- ORDERS PW lands on `finished_goods_buffer_location_id` with putaway/relocation DONE (no Rozlokowanie queue); MO finishes as `completed`
- Packing: FE_PICK finalized + pick allocation on buffer; `order_item_required_pack_qty` counts production fulfilled
- UI: produced X/Y, ready/pending/shortage counts on MO detail + list snippet

**Order-driven production materials (2026-08-12) — Phase 3:**
- After attach: `apply_material_validation_to_orders_mo` → `producible_now_qty` + StockReservation SSOT
- Partial cover: priority/oldest sources stay `reserved`; rest `shortage` → `status_on_component_shortage_id`
- `planned_quantity` / BOM snapshots / reservations sync to producible qty; `retry_order_driven_production_shortages`

**Order-driven production auto-MO (2026-08-12) — Phase 2:**
- Hook: `apply_order_panel_ui_status` → `on_order_panel_status_changed_production` (also bulk-status)
- Enter production status → create/aggregate `ProductionOrder` `source_type=ORDERS` via `ProductionOrderSourceItem`
- Aggregation key: tenant+warehouse+product+composition+picking_config, only `draft`/`planned`
- Concurrency: PG advisory lock + partial unique indexes; idempotency via active source on `order_item_id`
- Withdraw before start reduces planned; after collecting+ blocked; reentry reactivates/creates cleanly

**Order-driven production foundation (2026-08-12) — Phase 1:**
- Data: `ProductionOrder.source_type`, `production_order_source_items` (MO ↔ OrderItem)
- Config: `picking_config.is_production_mode` + after/shortage statuses + FG buffer location; trigger scope `SINGLE_ELEMENT`

**Picking validation (Walidacja zbierania) (2026-08-11):**
- Sekcja Terminal → „Walidacja zbierania”; opcja „Produkty bez kodu EAN”
- SSOT resolver: FE `resolvePickingValidationGates` + BE `resolve_picking_validation_gates`
- Priorytet lokalizacji: require_location_scan > multi-force > auto source
- BE egzekwuje product/location scan + rezerwę + brak EAN na quick-pick / cartless / confirm-remaining

**Picking stock split (2026-08-11):**
- `warehouse_stock` = suma Inventory w magazynie; checkbox „Stan magazynowy” tylko to
- Badge lokalizacji zawsze z `primary_location_stock` / `stock_quantity` lokalizacji

**Picking list view settings (2026-08-11):**
- `list_display` w `wms/settings/picking-terminal` (per tenant+magazyn) steruje kafelkami listy zbierania
- Checkboxy: zdjęcie / EAN / SKU / nr kat. / stan / lokalizacja — tylko lista, nie detail/qty
- Copy Widok: „Lista zbierania”; usunięte zbędne opisy sekcji

**Picking all-order config (2026-08-11):**
- `all_mode` + `all_order_sort` + `max_all_orders`; flow `all` nie dziedziczy single/multi

**Picking qty screen 1:1 (2026-08-11):**
- `PickingQtyPanel`: belka lokalizacji + kafel bez labela ILOŚĆ; logika pick bez zmian

**Inter font self-hosted (2026-08-11):**
- `@fontsource/inter` 400/500/600/700 w `main.tsx`; brak Google Fonts / gstatic

**Picking qty source location bar (2026-08-11):**
- Ekran ilości: `[←]` + belka aktualnej lokalizacji pobrania (`manualLocId ?? activeLocationId`)
- Nie zmienia listy ani detail poza wiringiem `locationLabel` do qty

**Picking order-type first (2026-08-11):**
- Nowa tura: status → ZAWSZE wybór single/multi/all → cart (jeśli trzeba) → produkty
- Wznowienie tylko z zapisanym order_type + cart/cartless
- Copy kart: „Produkty do zebrania” / „Produkty: zebrano X / Y”

**Picking detail flow (2026-08-11):**
- Detail obowiązkowy (bez auto-open qty); qty ← wraca do detail
- CTA skan: lokalizacja/produkt → qty; 401 terminal/detail nie maskowane
- GET `wms/settings/picking-terminal` + `wms/picking/product-lines/detail` przez shared axios

**Kolejność dostaw (2026-08-11):**
- SSOT = `GET /wms/delivery-work-queue` + `derive_warehouse_workflow_status` (istniejący flow PZ)
- W kolejce: NEW / COUNTING / COUNTED / PUTAWAY_IN_PROGRESS
- Poza kolejką: PUTAWAY_COMPLETED / CLOSED
- CTA wg stanu; sort=`delivery_queue_sort`, priority=`delivery_queue_priority` (niezależne od statusu)

**Picking flow 1:1 (2026-08-11):**
- STATUS → RODZAJ → POPUP WÓZEK → LISTA → PRODUKT → ILOŚĆ → ZATWIERDŹ → LISTA
- Lista: lokalizacja w kafelku; produkt: belka lokalizacji obok ←

**Picking lista/detal UI hierarchy (2026-08-11):**
- Lista: nagłówek ← + `Do zebrania: 0/2`
- EAN = `PackingEanBadge` (wspólny z pakowaniem); lokalizacja = `PackingLocationPill`
- Detal: ← + belka lokalizacji; qty panel bez samotnej liczby nad kontrolką

**Picking status UX + skan 409 (2026-08-11):**
- Root 409: `already_mine` blokował resolve gdy cart ASSIGNED bez otwartej sesji (orphan) + FE ufał sessionStorage
- BE: `has_active_session` tylko przy otwartej WmsOperationSession; heal orphan ASSIGNED→AVAILABLE
- resolve-cart: 409 ACTIVE_PICKING_SESSION tylko przy realnej sesji; orphan → heal + allow
- FE skan: zawsze refresh `active-session` przed decyzją; clear snapshot gdy BE=brak sesji
- UX: duża liczba zamówień; lekkie „Produkty…”; empty state Gotowe do rozpoczęcia

**Spójny przepływ zbierania (2026-08-10) — pełny SSOT:**
- Statusy: karty bez CTA; centralny prompt skanu; merge `active-session` → wiersze (bez mieszania BULK/BASKETS)
- BE: configured-statuses NIE dokleja sesji do pierwszego require_cart obcego typu
- Skan własnego wózka: statusy → open session; products/detail → cichy accept (zero „masz już…”, zero resolve-cart)
- 409 resolve-cart przy własnej sesji → otwórz istniejącą
- Cancel: cart_id → cancel-session; cartless tylko bez wózka
- UI: meta Wózek+Do zebrania; sticky ⋮|Zbierz; full width; lokalizacja na karcie

**Prompt skanu wózka na statusach (2026-08-10):**
- Usunięty czerwony banner „Zeskanuj wózek…”
- Po kliknięciu statusu wymagającego wózka (bez sesji): subtelny komunikat na środku + przycisk Sasist
- Karty bez CTA skanu; przy aktywnej sesji — badge, wejście bezpośrednio do zbierania

**Layout zbierania produktów (2026-08-10):**
- Pełna szerokość (`WmsOperationalPageBody wide`); sticky: ⋮ lewo / Zbierz prawo
- Meta: Do zebrania + badge wózka; lokalizacja tylko na karcie (PackingLocationPill)
- Detail: nazwa+EAN w headerze i na karcie; bez „Potwierdź”; bez max-w-3xl

**Lista statusów zbierania — spójny SSOT (2026-08-10):**
- Skan własnego CART → otwiera istniejącą sesję (products), zero resolve-cart / zero toastu „masz już wózek”
- „Produkty do zebrania” tylko na karcie z moją sesją; obce karty bez progresu i bez CTA gdy mam aktywną sesję
- Nazwa statusu ~19px / bold; CTA tylko przy braku sesji wózkowej
- Helper: `wmsPickingStatusSession.ts`; active-session zwraca products_*

**Sesje + skan wózków — spójna logika (2026-08-10):**
- Root: status page rejestruje handler TYLKO przy CTA → `has_handler=false` → „nie obsługuje skanera”; products zwracał `consumed=false` dla CART; CTA vs badge rozjeżdżały się przy type-match
- SSOT: `wmsPickingStatusSession.ts` + `GET /picking/active-session` równolegle z configured-statuses
- Statusy: handler ZAWSZE; aktywny wózek → toast, zero resolve-cart; CTA tylko `statusRowShowScanCartCta`
- Tile: `hasActiveSession` + absolutny zakaz CTA przy badge / inProgressByMe
- Products: CART-* zawsze consumed
- BE: bind sesji nawet gdy meta.source_status_id nie pasuje do konfiguracji

**Aktywny wózek SSOT (2026-08-10) — definitywna naprawa 409 BASKETS:**
- Root cause: skaner statusów fallbackował na `needsScanTiles[0]` (często BASKETS) przy sesji CART; CTA gdy `active_cart_type !== cart_type` kafelka; `session_source_status_id` nie było w schemacie Pydantic
- FE: `WmsPickingStatusPage` — skan TYLKO przy jawnym `scanTargetStatusId` bez aktywnej sesji; zero fallbacku typu; CTA wyłącznie gdy `!rowHasOperatorActiveSession`
- BE: `resolve_operator_active_picking_session` + `GET /picking/active-session`; configured-statuses wiąże sesję WYŁĄCZNIE do `meta.source_status_id`; obce kafle bez wózka/CTA mylącego
- Schema: `has_operator_active_session`, `session_source_status_id`
- resolve-cart: 409 gdy wózek już ASSIGNED/PICKING u operatora (nie start nowej sesji)
- Mixed cart_scan+baskets → BULK; „Wszystkie” w order-type tylko przy tym samym typie wózka

**Spójność sesji zbierania (2026-08-10):**
- Bug: `pickingSessionId` na sesji WÓZKOWEJ mylony z cartless → czyścił cartId, product-lines 409, cancel-cartless 400
- Fix: `isCartlessPickingSession` — cart_id wygrywa; merge nie wymusza cartless
- BE product-lines: session z cart_id → ścieżka wózkowa + source_status z meta
- cancel-cartless z cart_id → `cancel_picking`; tile mixed scanned+baskets → BULK (nie BASKETS)
- Projekcja: sesja tylko na swoim `source_status_id`; API `session_source_status_id`
- Skan CART-* na liście produktów przy aktywnej sesji → consumed, bez resolve-cart

**Wznowienie sesji zbierania (2026-08-10):**
- Jedna sesja = jeden wózek; skan tylko przy ROZPOCZĘCIU nowej sesji
- BE: `bootstrap_start_picking_if_needed` — walidacja typu wózka NIE przy PICKING/ASSIGNED+sesja
- FE: aktywna sesja → klik statusu → od razu produkty

**Sesja zbierania — SSOT wózek + produkty (2026-08-10):**
- Projekcja: `wms_picking_session_projection.py` (ten sam `build_wms_picking_product_lines` co lista)
- Statusy: `session_products_*` + `active_session_id` + `active_order_type`
- Hub „Wybierz”: produkty z sesji gdy aktywna; `order_count` nadal = wolne

**Przypisywanie wózków w zbieraniu — SSOT (2026-08-10):**
- Typ wózka vs kafelek: BULK↔`CartType.BULK`, BASKETS↔`MULTI`; reject PL msg
- Badge / skan na statusach; skip re-scan gdy pasujący wózek; lista zamówień filtr `source_status_id` na wózku
- `in_progress_by_me` filtruje typ wózka per status config (ASSIGNED|PICKING)

**Ekran Wybierz — układ + AKTYWNE (2026-08-10):**
- Kafelki single/multi/all w rzędzie (flex wrap: 3 / 2+1 / 1)
- Tekst: `Produkty do zebrania: X/Y szt.`
- Badge AKTYWNE z `active_order_type` hubu (otwarta sesja / inferencja zamówień)
- `order_type` zapisywane w metadata przy `start_picking` (bez zmiany assign)

**Status zbierania — badge wózka (2026-08-10):**
- Na kafelkach z `require_cart` (scanned/baskets): chip `Wózek: …` gdy operator ma ASSIGNED/PICKING
- SSOT: `Cart.assigned_user_id` via `configured-statuses` (`active_cart_*`); fallback `WmsPickingCartContext`
- Bez nowego mechanizmu przypisywania

**Picking UI rebuild — Sellasist-clean (2026-08-10):**
- White minimal list/detail; Sasist `PackingLocationPill` for locations; sticky „Zebrane” + ⋮ options sheet
- Kit: `components/wms/picking/Picking*` (header, card, sticky, primitives)
- Logic unchanged (scan/finalize/shortage/MULTI); typography via `wmsTypoClass`

**WMS Ogólne / typografia (2026-07-24):**
- Tab Ustawienia WMS → „Ogólne”: 5 poziomów 12|14|16|18|20 px (domyślna 16)
- SSOT: `wms_general_settings` + GET/POST `/wms/settings/general`
- FE: CSS vars on `WmsOperationalLayout` via `WmsOperatorTypographyProvider`; consume `wmsTypoClass`
- No auto-downscale on collectors — layout wraps instead
- Stare wartości (np. 21) normalizują się do 16 przy odczycie

**Picking terminal settings (2026-08-10):**
- DB/API: `WmsPickingTerminalSettings` → `/wms/settings/picking-terminal`
- FE policy: `pickingTerminalScanPolicy.ts` (`computeNeedsLocationScan`)
- Operator detail: gates + `product_scan_confirmed`; reserve filtered in product detail / pick paths

**Picking configurator status pickers (2026-08-09):**
- Modal uses shared `OrderUiStatusField` with raised portal z-index
- Allowed statuses from WMS panel groups + packing start IDs (not hardcoded names)
- Save blocked when source/target missing or outside allow-list

**Packing automation activators wired (2026-08-09):**
- Shared runner `orderAutomationRun.ts` → `change_status` via `PATCH …/ui-status`; other effect kinds fail with PL errors (no mocks)
- `PackingAutomationActivators`: labels/icons from rule, loader + exclusive run gate, errors via `showScannerError`
- Help copy no longer says activators don’t affect packing; visibility from enabled WMS packing rules only

**Packing list vs source status (2026-08-09):**
- Queue SSOT: only selected packing `status_id` (no name heuristic); eligibility requires `order_ui_status_id`
- FE counters exclusive from same API list; green translucent overlay on fully packed product cards

**Packing finish #1249 (2026-08-09):**
- Partial pick without shortage → recovery_work blocks finish (validation kept)
- SSOT: no fake physical-complete while recovery open; pick-capped required_pack_qty; clear PL message

**Packing carton gate UI (2026-08-09):**
- `PackingCartonGateModal`: white compact header + 5-col grid, JsBarcode from carton EAN/SKU/id, scan=select
- API: `WmsPackingRecommendedCarton.barcode` / `ean`; `ScannerHandler` no longer clears handler when disabled (carton gate can own scan)

**Bundle STOCK production order 500 (2026-08-09):**
- Cause: `production_orders.recipe_id` NOT NULL vs composition-only MO (`recipe_id=NULL`)
- Fix: schema ensure + migration; path remains `composition_id` from bundle manufacturing BOM

**Packing finish 404 no_cart (2026-08-09):**
- Finish loader: active queue OR fully-packed + mode-compatible fallback (Polish business messages)
- FE: keep `mode=all` when opening cartless card from all list; finish errors via red scan feedback overlay
- Regression: `backend/tests/test_packing_finish_no_cart.py`

**AutoActions screen rebuild (2026-08-09):**
- `AutoActionsView` + `PackingFinalizationView` share `AutoActionsShell` (mockup 1:1, white bg)
- Steps filtered by API `auto_actions`; COD block only when payment is COD
- States from `post_pack_pipeline` / finish progress; after-effect via `afterActionsBehavior` (scan / list / next — navigation still in controller)

**Packing view settings: location + activators (2026-08-09):**
- `locationBadgePosition`: only `top_right` | `in_details` („Prawy górny róg” / „W szczegółach produktu”); legacy corners → `top_right`
- Wired into Default/Active/Done cards + `LineDetailsBlock` via `location_placement` in field visibility
- Settings previews reuse real packing product cards; activators preview top strip / bottom pinned bar
- Removed `CAP_NONE` / „BRAK FUNKCJONALNOŚCI” from both selects; info tooltips via `PACKING_SETTING_HELP`

**Packing automation activator position (2026-08-09):**
- Setting `automationButtonsPosition`: only `top` | `bottom` („Na górze” / „Na dole”)
- Removed `floating` / `right` from UI + types; legacy → `bottom` via `normalizePackingAutomationButtonsPosition`
- Placement in product column only (not sidebar): top = strip above list/grid; bottom = pinned footer under scroll area

**Shipping method logos NS_BINDING_ABORTED (2026-08-09):**
- Root cause (page lifecycle, not broken files): DEV `React.StrictMode` remounted list logos after first paint → browser aborted in-flight `GET /uploads/...`; abort `onError` + module failure cache flipped `src` (more aborts). Double fetch without effect cleanup could `setRows` twice.
- Fix: drop StrictMode remount; cancellable single load by `warehouseId`; `mergeShippingMethodsRows`; mounted-only `onError`; no module fail-cache; memo list row + stable `key={id}`.
- Do not “fix” with more logo fallbacks / Railway / S3.

**Packing finish UUID series bug (2026-08-09):**
- `create_packing_packaging_rw`: `document_series_id=str(series.id)` (UUID), not `int(series.id)`
- Symptom was HTTP 400 on finish with carton selected (RW consume path)

**Packing cart/basket scan as list lookup (2026-08-09):**
- Status → session `mode=all` → orders list (no forced scan screen)
- Global scanner on list: cart → filter orders; basket → open order; empty → toast
- Picking collection config does NOT gate packing cart scan
- Helpers: `resolvePackingHandoffScan` + `applyPackingHandoffScanResult` (no PackingHandoffScanModal)

**Packing reopen already-packed (2026-08-09):**
- Click fully packed order → packing view (all Done, no active line) + `AlreadyPackedOrderModal`
- Accept → `POST …/acknowledge-reopen` → `PACKING_REOPEN_ACKNOWLEDGED` (WmsOrderEvent + activity log)
- X/Escape dismiss without log; back → lista; suppress AutoActions/finalization on reopen
- Detail fallback outside active queue for packed/finalized/status PACKED|SHIPPED|…

**Order panel status change (2026-08-09):**
- Endpoint: `PATCH office/order-ui/orders/{id}/ui-status` → `apply_order_panel_ui_status`
- Status always persists; cart detach only when `can_detach_order_from_cart` allows
- Detail UI: toast on error + `reloadOrderById` after success

**Packing layout settings (2026-08-09):**
- `layoutMode`: `with_sidebar` | `full_width` (legacy unused values → sidebar via schema v2)
- Full-width: no left sidebar; `PackingOrderFullWidthInfo` strip; denser product grid; Spakuj wszystko in header
- `movePackedToBottom` wired in `sortLinesForPacking` / `sortedLines`
- Order chrome toggles: `showOrderPhone`, `showOrderValue`, `showShippingAddress` (default ON)
- View settings: collapsible `Podgląd układu` under layout / products / comments / sales doc (default collapsed)

**Packing product appearance (2026-08-09):**
- Shared `packingProductDisplay.ts` merges `interface_display` + extended UI
- Cards (Active/Default/Done) honor stock/EAN/SKU/catalog/signature/price/name/truncate/image/location
- API: `product_signature`, `unit_price_display` on packing lines
- Mockup layout: fixed grid 20×19.5rem; list full-width rows; EAN badge; done = translucent green whole-card + faded image/data
- Settings preview (`ProductDisplayModePreview`): fixed card widths, includes Done sample
