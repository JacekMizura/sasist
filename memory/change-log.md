# Change Log

## 2026-06-05 — Visual operational runtime Phase 5 (WMS UI)

- WMS tab **Operacje** → `/wms/operations` (hub, replenishment, tasks, operators, alerts).
- Modular UI: `components/operations/`, `hooks/runtime/`, thin pages under `pages/wms/operations/`.
- Direct sales terminal: top bar + runtime footer, live stock via SSE.
- API clients: replenishment, alerts, orchestration; fix `operationalRuntimeApi` axios import.

## 2026-06-05 — Operational runtime Phase 4

- Replenishment engine: `operational_replenishment_rules`, detection → `wms_operational_tasks` (REPLENISHMENT/PICKFACE_REFILL/SHOWROOM_REFILL).
- Live runtime: `operational_live_events`, SSE `/operational-runtime/stream`, polling fallback.
- Mobile: `device_sessions`; operator SSOT: `operator_runtime_context`.
- Orchestration: `orchestration_state`, assign/transition API.
- Alerts: `operational_alerts`; multi-store stub: `store_transfer_requests`.
- Flags: `FEATURE_OPERATIONAL_RUNTIME`, `FEATURE_REPLENISHMENT_ENGINE` (default OFF).
- Frontend: `useOperationalLiveStream`, direct-sales live stock refresh.
- Tests: `test_operational_runtime_phase4.py`.

## 2026-06-05 — Modular package boundaries (operational commerce)

- Backend packages: `services/direct_sale/`, `documents/`, `reservations/`, `pickup/`, `workers/`.
- Legacy flat service files → thin shims (backward compatible imports).
- Frontend: `pages/wms/direct-sales/` with hooks + components + thin `DirectSalesPage`.
- Cursor rule: `.cursor/rules/operational-module-boundaries.mdc`.
- Tests updated to import from package paths.

## 2026-06-05 — Operational sales Phase 3 (commerce expansion)

- Async document pipeline: `document_generation_jobs`, queue/worker/fiscal dispatch, `document_series_resolution_rules`.
- Series resolution by channel/mode/zone — no hardcoded FV/PA/WZ in operational flows.
- Reservation lifecycle service + expiration worker; soft-hold scan (`FEATURE_SESSION_SOFT_HOLD`).
- Pickup flow API + `operational_commerce_task_service` (PICKUP_PREP/READY/HANDOFF).
- Payment orchestration fields: provider, terminal, settlement_state, external_transaction_id.
- Workstation device columns: printer_id, scanner_type, fiscal_terminal_id, zone_id.
- Event envelope hardening (`metadata` + `payload`); logs `[reservation.lifecycle]`, `[document.pipeline]`, `[pickup.flow]`, `[payment.orchestration]`.
- Location-stock live `revision`/`as_of`; soft-hold in availability projection.
- Frontend: `/wms/direct-sales` scanner-first terminal + WMS tab.
- Schema: `ensure_operational_sales_phase3_schema`; startup workers for docs + reservations.
- Tests: `test_operational_sales_phase3.py`.

## 2026-06-05 — Operational sales safety hardening (rollout)

- `OperationalFeaturesContext` — request-scoped via ContextVar; resolved once per request (`operational_features_deps.py`).
- Scoped flags: global env → tenant (`warehouse_id=0`) → warehouse (`operational_feature_scopes` table).
- Observability: `[wms.eligibility]`, `[direct-sales.complete]`, `[order.operational-mode]` (`operational_observability.py`).
- WMS eligibility snapshot tests: `test_wms_eligibility_snapshots.py` (NULL/WMS/IMMEDIATE/PICKUP/DELIVERY/malformed).
- Direct-sales API isolation: `operational_sales_sessions_for_request` — single generator dependency (gate + bind); no nested Depends on generator.
- NULL legacy compatibility documented as permanent in `order_operational_mode.py`.
- All operational-sales tests green (32 passed).

## 2026-06-05 — WMS backward compatibility guard

- `order_operational_mode.py` — `resolve_order_operational_mode` (NULL → ONLINE + WMS).
- `operational_sales_flags.py` — feature flags default OFF; WMS exclusion opt-in only.
- `wms_queue_eligibility` — no SQL filters when exclusion disabled; centralized NULL-safe clauses.
- `/direct-sales/*` gated behind `FEATURE_OPERATIONAL_SALES_SESSIONS`.
- Tests: `test_wms_backward_compatibility.py`.

## 2026-06-05 — Operational sales Phase 2 (execution pipeline)

- Atomic `complete_direct_sale_session`: order-first → reserve → issue → payment → documents → session complete.
- Services: `direct_sale_issue_plan_service`, `direct_sale_stock_service`, `direct_sale_order_service`, `direct_sale_payment_service`, `direct_sale_document_pipeline_service`, `direct_sale_complete_service`.
- API: `POST /api/direct-sales/session/{id}/start-payment`, `…/complete`, `…/set-customer`.
- Movements: `MOVEMENT_ISSUE` + reservation audit rows; traceability columns on `order_items`.
- Events persisted to `operational_commerce_events` (direct_sale.*, reservation.*, stock.*, payment.*).
- Schema: `ensure_operational_sales_phase2_schema`.
- Tests: `test_operational_sales_phase2.py`.

## 2026-06-05 — Operational sales Phase 1 (direct-sales foundation)

- Schema: `order_channel`, `fulfillment_mode`, location zones/priorities, `direct_sale_sessions`, `payments`, `operational_workstations` (`ensure_operational_sales_phase1_schema`).
- Services: `wms_queue_eligibility`, `location_stock_service`, `location_priority_service`, `direct_sale_service`, `operational_sales_events`.
- API: `GET /api/location-stock`, `POST /api/direct-sales/session`, `…/scan`, `…/suspend`.
- WMS: picking + packing queues exclude `fulfillment_mode=IMMEDIATE`.
- Catalog: ZW + ZD in operational warehouse bootstrap (10 series total).
- Tests: `test_operational_sales_phase1.py` (11), picking finalize test updated for 3 eligibility clauses.
- Docs: `memory/direct-sales-architecture.md` §19 final additions.

## 2026-06-04 — Braki queue fault tolerance + WMS mode strip

- Backend: `braki_queue_normalize.py` — fallback karty zamiast skip; pola `partial_data`, `queue_warnings`.
- Frontend: `normalizeShortageQueueCard.ts`, `mergeQueueCards` — render partial + warning badge.
- Layout: `WmsExecutionModeStrip` + zawsze widoczny `ExecutionGlobalContextBar` (`defaultExecutionContextForPath`).
- Test: `test_braki_queue_normalize.py`.

## 2026-06-04 — Braki global bar + force remove

- Przywrócono globalny pasek operacyjny na hubie i detalu Braki (`executionContextFromBrakiTask/Hub`); wzbogacony `ActiveOperationContextBar` (etap, priorytet, liczniki zebrane/dogrywka/rozlokowanie/pakowanie, badge OMS).
- Usunięto duplikat `BrakiOperationalHeader` z widoku detalu.
- `RecoveryWorkflowService`: `force_remove_braki_order`, `close_braki_operational_workflows_for_order`, `snapshot_braki_active_operations`.
- API: `POST /wms/order-issue-tasks/{id}/force-remove` (full / wms_only / oms_review).
- UI: `BrakiForceRemoveModal` — operator zawsze może usunąć zamówienie z kolejki Braki.
- Testy: `test_braki_force_remove.py`.

## 2026-06-04 — Recovery intelligence (priority + batch + soft reserve)

- `recovery_intelligence.py` — scoring priorytetu braków (CRITICAL/HIGH/NORMAL/LOW), batch dogrywki, soft reservation.
- API Braki: `shortage_priority_score/level/label`, sort kolejki desc.
- `WmsRecoveryBatchSession`, `WmsRecoverySoftReservation` — modele operacyjne (nie workflow engine).
- Hook `process_recovery_stock_increase` na ruchach magazynowych (putaway/receiving/adjustment…).
- UI: badge priorytetu w Braki, przycisk „Dogrywka batch”, ekran `/wms/picking/recovery/batch/:id`.

## 2026-06-04 — Braki mixed-state workflow

- Braki jako overlay — wiele równoległych strumieni w jednym zamówieniu (`braki_workstreams`).
- Backend: `build_braki_detail_sections_from_state` — sekcje z resolvera (relocation tylko picked).
- API: `relocation_lines`, `packing_ready_lines`, `BrakiWorkstreams`.
- Frontend: `BrakiOperationalHeader`, 4+ sekcje produktów, wiele CTA, batch ZWK + rozlokuj teraz.
- Zawsze widoczne „Usuń z Braki WMS”; `ActiveOperationContextBar` na detalu.

## 2026-06-04 — Nośniki vs picking tools (UI domain)

- Rozdzielono w UI **narzędzie zbierania** (wózek/koszyk) od **nośnika logistycznego** (PAL, BOX…).
- `ExecutionActiveContext`: `pickingToolLabel`, `relocationTargetType` (LOCATION|CARRIER_UNIT), `packagingLabel`.
- `ActiveOperationContextBar`: osobne wiersze celu rozlokowania vs wózek vs karton pakowy.
- Mappery `syncExecutionContext`, `operationalWorkflow` (hinty RELOCATION wg trybu), relocation/picking/packing pages.
- `wmsTerminology.ts`: `mapRelocationModeToTargetType`, etykiety domenowe.

## 2026-06-04 — WMS stabilization: errors + stale tasks + CTA fixes

- API błędy operacyjne: ``detail={"message": "..."}`` w ``wms_operational_tasks``, ``wms_order_issue_tasks`` (list/detail/archive), ``wms_relocation`` finalize.
- List Braki 500: bez wycieku ``str(exc)`` do klienta.
- ``serialize_order_issue_task_item``: jeden pass resolvera + ``recovery_state_for_braki_task(skip_repair=True)``.
- ``sync_operational_tasks_for_order``: zamyka osierocone ``RELOCATION`` gdy resolver nie ma pending.
- ``braki_workflow_service``: usunięty martwy kod; ``order_needs_warehouse_pick`` tylko z resolvera.
- Frontend: filtry Braki z ``shortage_lifecycle_phase``; archive CTA ``disabled`` gdy ``can_close_shortage``; ``extractApiErrorMessage`` / ``formatOperationalError`` na detail/load.

## 2026-06-04 — Unified Active Operation Context Bar

- ``ActiveOperationContextBar`` + rozszerzony ``ExecutionActiveContext`` (typ operacji, zamówienie, wózek/batch, źródło, cel, pozostało, krok, operator).
- Globalny pasek w ``WmsOperationalLayout`` na trasach wykonawczych; mappery ``executionContextFromPicking/Packing/OperationalDetail/Putaway``.
- Podpięte: dogrywka (lista + detal produktu), rozlokowanie produktów, zadania operacyjne, pakowanie zamówienia.
- ``ScanExecutionShell`` — offset nagłówka pod pasek; usunięto duplikat lokalnego paska w relocation.

## 2026-06-04 — WMS terminology UI normalization

- Rozdzielono „Rozlokowanie” na **Rozlokowanie PZ** (putaway/inbound) i **Rozlokowanie produktów** (RELOCATION / nośniki po zbieraniu).
- Frontend: tab putaway, relocation detail, Braki filtry/CTA, kolejki operacyjne, timeline, event labels, workforce labels.
- Backend (tylko etykiety API/UI): ``BRAKI_FILTER_LABELS_PL``, queue label, task summary, centrum operacyjne (putaway alerts).
- ``frontend/src/pages/wms/wmsTerminology.ts`` — słownik UI (bez zmiany encji backendowych).
- Dogrywka — bez zmiany nazwy.

## 2026-06-04 — Operator vs supervisor UX split

- ``/wms/operational-queues`` → redirect na ``/wms/braki`` (operator home).
- Pulpit KPI: ``WmsSupervisorDashboardGate`` (superadmin / ``analytics.warehouse_operations`` / ``VITE_WMS_SUPERVISOR_DASHBOARD``).
- Back z relocation/task shell → Braki; heatmapa dashboardu bez linków do kolejek.

## 2026-06-04 — Braki detail: single resolver-driven CTA

- ``brakiPrimaryAction()`` — jedna akcja z ``shortage_lifecycle_phase`` (SSOT).
- Usunięto: modal ZWK, drugi przycisk archiwum, link OMS, logikę ``needsRelocationChoice``.
- Relocation: auto bootstrap add-items + session gdy brak ``relocation_task_id``.
- ``DONE`` = spakowane + ``Usuń z Braków`` (``order_fully_packed`` w resolverze).

## 2026-06-04 — WMS stabilization lock

- Reguła Cursor: `.cursor/rules/wms-stabilization.mdc` — SSOT, zakazane warstwy, kanoniczny lifecycle.
- `memory/wms-stabilization.md` — mapa architektury.
- `canonical_shortage_lifecycle_phase()`, `RELOCATION_MODE_*`, API `shortage_lifecycle_phase` / `relocation_mode`.
- UI: „Dystrybucja” → „Rozlokowanie (nośniki)”; payload RELOCATION: `relocation_mode=CARRIER`.

## 2026-06-04 — Relocation: series gate + UI crash fix

- ``relocation_document_series_service`` — walidacja serii WAREHOUSE (RW/PW/ZWK) przed utworzeniem ZWK; auto-wybór gdy jedna seria RW.
- ``POST /wms/relocation/add-items`` — brak surowego 500; ``400`` z ``detail.message`` (np. brak serii).
- ``WmsRelocationDetailPage`` — import ``ActiveWorkContextBar`` (fix ReferenceError po starcie sesji).
- ``RelocationBatchChoiceModal`` — ``extractApiErrorMessage`` dla komunikatów biznesowych z API.

## 2026-06-04 — Relocation workflow: resolver SSOT + self-heal (order #1197)

- ``has_pending_relocation`` — tylko aktywne alokacje (pending/partial), nie historia ``done``.
- ``visible_in_relocation`` — per-linia z ``relocation_line_alloc_states_for_order`` (done → false).
- ``repair_order_relocation_consistency`` — auto-tworzenie zadania RELOCATION gdy resolver wymaga, brak alloc.
- Wywołania repair: serializacja Braki (detail + lista), ``can_close_braki_shortage``, ``ensure_relocation_tasks_synced``.
- ``can_close_shortage`` — blokada także przy ``visible_in_relocation`` (missing task do naprawy, nie dead-end).
- API ``relocation_task_id``; CTA „Rozlokuj produkty” → bezpośrednio do zadania gdy istnieje.

## 2026-06-04 — WMS frontend: stop request storms

- ``wmsRefresh.ts`` — debounced ``dispatchWmsShortagesUpdated``, in-flight request dedupe, visibility-aware polling.
- Priority tasks: 30s poll, paused when tab hidden; in-flight guard in ``WmsTopBar``.
- API dedupe: ``product-lines``, ``order-issue-tasks``, ``priority-tasks``.
- Picking/recovery: single ``productLinesLoadKey`` load pipeline; recovery uses ``pickingListRefreshAt`` not global shortages fan-out.
- Braki/queues/detail: ``useWmsShortagesRefresh`` (debounced) zamiast surowych listenerów.

## 2026-06-04 — Resolver consistency: packing / queue / relocation

- Agregaty zamówienia w resolverze: ``has_recovery_pick_work``, ``has_pending_relocation``, ``has_unresolved_lines``, ``packing_allowed``, ``relocation_alloc_pending/partial``.
- ``get_recovery_pick_lines`` — wyłącznie ``visible_in_recovery_pick``; test spójności z ``count_recovery_operational_lines``.
- ``sync_relocation_tasks_from_recovery_state`` — bez globalnego skip przy aktywnym zadaniu; ``ensure_relocation_tasks_synced_for_order`` dla UI ZWK.
- ``braki_workflow_service`` — status filtrów tylko z agregatów resolvera (bez ``_order_relocation_alloc_states`` / ``order_has_pending_shortage_decision``).
- Frontend ``WmsOrderIssuesHub`` — licznik kart z ``recovery_active_lines`` (nie ``shortage_lines.length``).

## 2026-06-04 — Braki: przywrócono CTA „Zamknij brak” (resolver)

- ``can_close_braki_shortage`` + ``recovery_state_for_braki_task`` — pola API: ``can_close_shortage``, ``recovery_packing_allowed``.
- Frontend ``WmsOrderIssueDetailContent`` — widoczność przycisku z ``task.can_close_shortage`` (nie legacy linii UI).
- ``archive_order_issue_task`` — walidacja z resolvera; zamyka stale recovery task przy archiwum.

## 2026-06-04 — Usunięcie legacy shortage mutation layer

- Usunięto ``recalculate_order_shortage_state`` / ``sync_shortage_workflow_for_order`` — stan wyłącznie z resolvera.
- ``recompute_order_fulfillment`` — tylko kolumny ``wms_picking_line_missing_qty`` (bez mutacji workflow).
- ``apply_fulfillment_state_from_resolver`` — minimalna persystencja ``fulfillment_state`` + status panelu.
- finalize-cart: usunięto pętlę ``recalculate_order_shortage_state`` i ``upsert_order_issue_tasks`` po domknięciu.
- packing enter / finish: ``packing_allowed`` z resolvera; bez starych filtrów ``unresolved_shortage``.

## 2026-06-04 — Workflow unification (finalize / relocation / packing SSOT)

- ``RecoveryWorkflowService`` — ``can_order_be_packed``, ``validate_order_finalize_allowed``, ``sync_relocation_tasks_from_recovery_state``, ``state_hash`` / ``state_version`` / ``resolved_at``.
- ``finalize_wms_picking_cart`` — wyłącznie resolver; logi ``[picking.finalize.*]``; błędy 400/404/409 (nie 500).
- ``ensure_relocation_for_order_item_picks`` — gate ``relocation_required`` z resolvera (zwykły brak → brak zadania).
- OMS line removal → ``sync_relocation_tasks_from_recovery_state`` zamiast bezpośredniego ``ensure_relocation``.
- ``order_has_active_braki_operations``, ``braki_workflow_service`` — delegacja do resolvera (packing / recovery / shortage).
- Frontend: ``WmsPackingOrdersPage`` → ``extractApiErrorMessage``.
- Testy: ``test_recovery_workflow_finalize.py``.

## 2026-06-04 — finalize-cart: brak HTTP 500 dla workflow recovery

- ``finalize_wms_picking_cart`` — etapy z logami: ``[picking.finalize.start|validate|recovery|relocation|finish|error]``.
- Walidacja wyłącznie przez ``RecoveryWorkflowService`` (cache stanu per zamówienie).
- ``PickingFinalizeError`` → HTTP 400/404/409 (nie 500); nieoczekiwane → 503.
- API ``POST /wms/picking/finalize-cart`` zwraca ``detail.message`` / ``detail.error``.
- Frontend ``extractApiErrorMessage`` czyta ``detail.error``.

## 2026-06-04 — RecoveryWorkflowService (jedno źródło prawdy)

- ``recovery_workflow_service.py`` — ``resolve_order_recovery_state()`` z pełnym stanem linii + ``[recovery.state]`` logi.
- Kolejka Braki, dogrywka, finalize-cart, quick-pick recovery, pakowanie — delegacja do resolvera.
- ``get_unresolved_recovery_lines`` → ``get_recovery_pick_lines`` (kompatybilność wsteczna).
- ``count_issue_queue_operational_lines`` → ``count_recovery_operational_lines``.
- Quick-pick po recovery zwraca listę z ``recovery_mode=True``.
- ``GET /orders/{id}/notes`` — koniec 404 w OMS szczegół zamówienia.
- Frontend: ``extractApiErrorMessage`` + WmsPickingProductsPage (finalize / quick-pick).
- Test: ``test_recovery_workflow_service.py``.

## 2026-06-04 — Finalize-cart: częściowa zbiórka + dogrywka (recovery deferred)

- ``get_unresolved_recovery_lines`` — jedno źródło prawdy dla linii dogrywki; log ``[wms.recovery.lines]`` per linia.
- ``finalize_wms_picking_cart`` — nie blokuje na niezebranych liniach recovery-eligible; po finalize: ``ensure_recovery_pick_task`` + ``FS_NEEDS_DECISION``.
- ``_picking_line_resolved_for_finalize`` — ``recovery_deferred`` zamiast ``incomplete`` gdy możliwa dogrywka.
- ``count_issue_queue_operational_lines`` — ``r_pend`` z ``get_unresolved_recovery_lines`` (spójność z UI Braki / recovery list).
- ``_needs_recovery_picking`` — tworzenie tasku z SSOT (wcześniej ``r_pend=0`` blokowało task mimo nierozwiązanych linii).
- Test: ``test_wms_picking_finalize_recovery_deferred.py``.

## 2026-06-04 — WMS finalize-cart 500 (timezone + błędy API)

- **Przyczyna 500:** ``emit_wms_picking_finished`` / ``record_picking_cart_finalize_session`` porównywały ``picking_started_at`` (PG timestamptz, aware) z ``picking_finished_at`` (naive ``utcnow``) → ``TypeError``.
- ``_naive_utc_dt`` w ``wms_audit_service`` — bezpieczna arytmetyka czasu sesji.
- Logi: ``[wms.picking.finalize.start]``, ``[wms.picking.finalize.order]``, ``[wms.picking.finalize.error]``; snapshot kohorty (picked/shortage/unresolved).
- ``PickingFinalizeError`` + endpoint zwraca ``{ error, reason, order_id, cart_id }`` zamiast gołego „Internal server error”.
- ``_classify_order_after_picking_session`` pomija bundle parent / replaced / linie zestawu.
- Test: ``test_wms_picking_finalize_datetime.py``.

## 2026-06-04 — RMZ: zapis „Przyjęty” jednym klikiem

- ``WmsReturnsPage``: przy ``pendingNull === 1`` klik **PRZYJĘTY** od razu wywołuje zapis (bez kroku wyboru ilości); odrzucenie z 1 szt. przechodzi prosto do edytora powodu.
- ``confirmPickAcceptSave(lineId, pickCount)`` — liczba sztuk przekazywana w argumencie (nie ze stale state); ref ``confirmPickAcceptSaveRef`` dla ``beginGridDecision``.
- ``saveSplitForLine``: ``effectiveReturnDbId`` z ``wmsReturn.id`` / route ``rid`` (bez race na ``selectedReturnDbId``).
- Logi debug: ``[returns.report.click]``, ``[returns.report.submit]``, ``[returns.report.success]``.

## 2026-06-04 — Dogrywka zbierki z kolejki Braki (recovery_order_id)

- ``prepare_recovery_picking_for_order`` — auto ``WmsRecoveryPickTask`` gdy ``r_pend > 0``; logi ``[wms.recovery.open]`` / ``[wms.recovery.lines.fetch]``.
- GET ``/picking/product-lines?mode=recovery&recovery_order_id=`` — 200 + ``recovery_completed`` zamiast 404 przy braku linii.
- ``_recovery_demand_by_product_from_orders`` — tylko pozostałe ilości do zebrania (nie całe zamówienie).
- Frontend: ``mode=recovery``, UX „Braki zostały już rozwiązane”; test ``test_recovery_picking_open.py``.

## 2026-06-04 — Pakowanie: finish po workflow braków

- ``order_item_required_pack_qty`` — wymagana ilość po ``oms_removed_qty`` / zbieraniu, nie surowe ``quantity``.
- ``_packing_finish_validation_snapshot`` + log ``[wms.packing.finish.validation]``; finish blokuje tylko przy aktywnych brakach / niedospakowaniu.
- ``pack-all`` / skan / ``_is_order_fully_packed_db`` używają ``quantity_required``; API pole ``quantity_required`` na linii.
- Błędy finish: JSON ``{ code, error }`` zamiast gołego 500; frontend ``wmsPackingApiErrorMessage``.
- Test: ``test_packing_finish_shortage_order.py``.

## 2026-06-04 — Braki: fałszywy stan „Oczekuje na decyzję OMS”

- `order_line_pick_still_possible` / `order_line_requires_oms_decision` — decyzja OMS tylko po eskalacji; sam brak przy możliwej dogrywce ≠ OMS.
- `resolve_braki_workflow_status` — priorytet zbierania przed `awaiting`; log `[wms.issue.state_transition]`.
- `braki_queue_bucket` — `awaiting_oms` tylko gdy `order_has_pending_shortage_decision`.
- Liczniki kolejki: `u_short` (OMS) + `r_pend` (do zebrania); karta hub sumuje oba.
- UI hub/szczegóły: Status „Braki”, Typ „Oczekujące produkty do zebrania” / „Możliwa dogrywka”.
- Test: `test_braki_workflow_pick_vs_oms.py`.

## 2026-06-04 — Kolejka braków: wydajność listy

- Lekki serializer `serialize_order_issue_task_list_card` (bez order_context, logów, lokalizacji); pełny payload tylko GET `/{id}`.
- Batch `_fetch_orders_by_id` + `selectinload` items/product — koniec N+1 Order w pętli.
- `sync_open_issue_tasks_for_warehouse(full_recalc=False)` domyślnie; `?sync=true` przy ręcznym odświeżeniu.
- Log `[wms.issue_queue.performance]` (db_fetch_ms, serialization_ms, sql_query_count).
- Indeks `(tenant_id, warehouse_id, status)` na `order_issue_tasks`; hub używa `unresolved_shortage_count`.

## 2026-06-04 — Kolejka braków: `name 'order' is not defined`

- `serialize_order_issue_task_item`: `braki_waiting_stock(o, …)` zamiast niezdefiniowanego `order`.
- `skipped_tasks`: `error_code=TASK_SERIALIZATION_FAILED`, komunikat bez surowych wyjątków Python; log `[wms.order_issue.serialize]`.
- Test: `test_order_issue_task_serialize.py`.

## 2026-06-04 — PostgreSQL: usunięcie sqlite_master z runtime

- `backend/db/schema_introspection.py` — `has_table`, `get_table_column_names`, `has_index`, `ensure_order_issue_tasks_archive_columns` (Inspector zamiast `sqlite_master`).
- `schema_upgrade.py` — ~128 probe’ów tabel zamienionych na `_table_exists` / `_table_column_names`; archiwizacja braków deleguje do introspection.
- `order_issue_task_service` importuje introspection (bezpośredni import omijał no-op wrapper z `main.py`).
- `main.py` — `ensure_order_issue_tasks_archive_columns` wyjątek z no-op na Postgres; log `[db.engine]` przy starcie w `database.py`.
- `inventory_serial_service`, `shipping_method_service`, `system.py` — Inspector zamiast `sqlite_master`.

## 2026-06-04 — Kolejka braków GET /order-issue-tasks (500)

- Przyczyna: brak kolumn `archived_at` / `archived_by_user_id` w DB przy filtrze ORM → `no such column`.
- `ensure_order_issue_task_table_schema()` przed każdym odczytem `OrderIssueTask` (lista, szczegół, skan, archiwizacja).
- Lista: per-task try/except → `skipped_tasks`; logi `[wms.order_issue_tasks.fetch|serialize_failed|invalid_state]`.
- Całkowita awaria DB: JSON `detail: { success, error, message }` zamiast HTML 500.
- Frontend hub: komunikat z API + „Spróbuj ponownie”; test `test_order_issue_tasks_list_schema.py`.

## 2026-06-04 — Zgłoszenie braku przy częściowym zbieraniu (1/2)

- ``_line_shortage_report_quantities`` — ``remaining = ordered − picked − missing`` (jak karta produktu); nie ``picked > 0 ⇒ zamknięte``.
- Komunikat odrzucenia: „Cała wymagana ilość została już rozliczona…”.
- Log ``[wms.shortage.report]``; test ``test_report_shortage_partial_pick.py``.

## 2026-06-04 — Archive braków 500 + bezpośrednie pakowanie z braków

- Archive: brakujący ``logger`` w ``order_issue_task_service`` (NameError → 500); idempotentność; ``archived_at`` / ``archived_by_user_id``; log ``[wms.shortage.archive]``.
- ``close_operational_tasks_for_order``: pomija linie bez ``product_id`` (``int(None)``).
- ``POST /wms/packing/orders/{id}/enter`` — bootstrap sesji; frontend ``navigateBrakiToPacking`` zapisuje ``wms_packing_session`` i idzie na ``/wms/packing/order/:id``.

## 2026-06-04 — „Braki — decyzja” tylko przy aktywnej decyzji OMS

- ``order_has_pending_shortage_decision`` + log ``[wms.order.status.compute]`` (``braki_order_state_service``).
- ``compute_wms_workflow_phase(order, db)`` — ``NEEDS_DECISION``/``MISSING`` tylko gdy ``pending_decision``; inaczej faza z timestampów (np. ``READY_TO_PACK``).
- ``sync_shortage_workflow``: wczesne ``_clear_fulfillment_shortage_state_if_resolved``; ``order_has_waiting_for_stock_lines`` wymaga ``mq > 0`` z ``db``; czyszczenie starych flag ``oms_waiting_*`` przy ``mq=0``.
- ``resolve_braki_workflow_status``: koniec łańcucha nie domyślnie ``awaiting``.
- Lista OMS / karta WMS: ``compute_wms_workflow_phase(..., db=db)``.
- Test: ``test_wms_workflow_phase_pending_decision.py``.

## 2026-06-04 — Fix React #310 (braki szczegół)

- ``WmsOrderIssueDetailPage``: shell ładowania/skanu; UI + ``onArchiveShortage`` w ``WmsOrderIssueDetailContent`` (montowany tylko z ``task`` — brak zmiany liczby hooków przy przejściu loading→loaded).
- Wcześniej: ``useCallback(onArchiveShortage)`` był po ``return`` loading (v14); v16 przesunął hook — split jest trwałą ochroną.
- ``App.tsx``: ``ErrorBoundary`` na braki / issues/task / relocation oraz ``/orders/:id`` (OMS).
- DEV: ``console.log("render shortages detail", …)`` w ``WmsOrderIssueDetailContent``.

## 2026-06-04 — OMS: polskie etykiety zdarzeń zamówienia

- ``frontend/src/utils/orderEventLabels.ts`` — mapa kodów WMS/OMS → PL, kategorie, ikony/kolory, fallback title-case.
- ``OrderEventTypeLabel`` w logach zamówienia (Podsumowanie / Dziennik); historia WMS w ``orderHistoryTimelineModel``.

## 2026-06-04 — Rozlokowanie: batch ZWK vs sesja operatora

- API: ``GET /wms/relocation/batch-context``, ``POST /wms/relocation/add-items``, ``POST /wms/relocation/start-session``; serwis ``wms_relocation_batch_service`` (dokument ``ZWK`` draft, dedupe ``OI:{order_item_id}``).
- Logi: ``[wms.relocation.document.add]``, ``[wms.relocation.session.start]``.
- Braki szczegół: modal ``RelocationBatchChoiceModal`` — „Tylko dodaj do dokumentu” (bez redirect) / „Dodaj i przejdź do rozlokowania”.
- ``WmsRelocationDetailPage``: sesja tylko przy ``state.startRelocationSession`` lub ``?autostart=1``; przycisk „Rozpocznij rozlokowanie” w podglądzie.
- Testy: ``test_wms_relocation_batch.py``.

## 2026-06-04 — Braki: fałszywe „Do rozlokowania” (order 1206)

- Usunięto auto-``merge_relocation_from_picks`` z ``finalize_wms_recovery_picking_cart`` (udany recovery pick → ``ready_pack``).
- ``relocation_reason`` (PICKED_ITEM_REMOVED / REPLACEMENT_LEFTOVER / …); agregacja ignoruje legacy ``recovery_finalize:*``.
- ``prune_invalid_relocation_allocations`` + logi ``[braki.relocation.debug]``.

## 2026-06-04 — Zgłoszenie braku na linii zamiennika (report-shortage)

- ``resolve_picking_config_for_shortage_report``: fallback status panelu zamówienia / domyślna reguła magazynu gdy ``order_item_id`` lub ``recovery_order_id``.
- Logi ``[shortage.report]`` (order_item, replacement, recovery, picking_context).
- Testy ``test_report_shortage_substitute.py``.

## 2026-06-04 — Braki: OMS removal → relocation, etykiety, archiwizacja, CORS

- Usunięcie zebranego produktu (OMS): ``ensure_relocation_for_order_item_picks`` z sumą PICK + fallback ``merge_relocation_task``; log ``[wms.relocation.create]``; purge nie kasuje TASK_RELOCATION.
- ``removal_type`` (shortage / manual_oms / …) w metadanych linii + UI OMS (badge, callout, footer).
- ``POST /wms/order-issue-tasks/{id}/archive`` — zamknięcie z kolejki gdy ``ready_pack``; status ARCHIVED.
- ``sync_operational_tasks_for_warehouse`` — tylko zamówienia z OPEN issue / aktywnymi taskami (fix 502); CORS na HTTPException.

## 2026-06-04 — Braki: relocation tylko przy aktywnych alokacjach

- ``relocation_alloc_counts_for_order`` / ``find_relocation_task_for_order`` — pending/partial tylko; auto-close zadania gdy wszystkie alokacje done; logi ``[braki.relocation.check]``.
- Pominięcie ghost alokacji (linia qty=0 / archiwum REPLACED bez przeniesienia).
- ``_order_fully_picked_for_fulfillment`` — ``line_closed_for_picking_finalize`` gdy jest ``cart_id``.
- Test: ``test_braki_relocation_active_gate.py``.

## 2026-06-04 — Finalize zbierania: domknięcie linii pick + brak

- ``line_shortage_qty_for_picking_finalize`` / ``line_closed_for_picking_finalize`` — ``picked + shortage >= required``; OMS „czeka na towar” nie blokuje pickera.
- ``sum_missing_events_for_line_cart``; logi ``[picking.finalize] LINE_CHECK`` z ``effective_qty``.
- Testy 4 scenariusze + frontend: komunikat „Nie wszystkie pozycje zostały zebrane lub oznaczone jako brak.”

## 2026-06-04 — DELETE order item: orphan shipping_method_id

- `order_shipping_fk_service`: sanitize orphan `orders.shipping_method_id` before persist; startup SQL cleanup in `ensure_shipping_methods_table_and_order_fk`.
- `_recompute_order_value_and_volume(order, db)` calls sanitize; DELETE item 500 → friendly PL message (no raw SQL in response).
- Frontend: `extractApiErrorMessage` hides raw DB errors; OMS delete toast fallback.
- Test: `test_order_delete_item_orphan_shipping.py`.

## 2026-06-04 — Braki: ready_pack po recovery pick

- **`order_braki_picking_resolved`**: `ready_pack` gdy zbiórka/recovery domknięta (nie czeka na pełne pakowanie); naprawa `order_line_awaiting_oms_attention` (nie blokuje po historycznym braku).
- **Fulfillment**: `_clear_fulfillment_shortage_state_if_resolved` → `READY_TO_PACK` po picking resolved.
- **Front**: `brakiWorkflowCta.ts` — CTA wyłącznie z `braki_workflow_status`; detail: baner „gotowe do pakowania”, bez pustych sekcji braków.

## 2026-06-04 — Braki: ready_pack gate, soft-delete linii, pakowanie

- **`order_can_show_ready_pack`**: brak `ready_pack` przy otwartych brakach / issue task / recovery; log `[braki.workflow] ORDER_STATE_EVAL`.
- **Pakowanie**: `list_packing_orders` filtruje po `order_can_show_ready_pack`; `_enforce_packing_queue_eligibility` cofa `READY_TO_PACK`.
- **Finalize wózka**: panel status „braki” gdy `all_picked` ale workflow nie domknięty; `recalculate_order_shortage_state` po finalize.
- **DELETE linii OMS**: `soft_remove_order_item` zamiast hard-delete (FK `wms_order_events`).

## 2026-06-04 — WMS picking: scanner, shortage modal, finalize-cart

- **Scanner:** `DevScannerPanel` auto-expand + focus on `mode=picking`; modal backdrop `onMouseDown`; refocus po zamknięciu modala braku.
- **Shortage modal:** jeden klik submit (`shortageBusy`, deferred open); logi `[shortage.modal]`.
- **Finalize-cart:** `_picking_line_resolved_for_finalize`, `compute_line_missing_qty` + declared shortage; pomijanie `REPLACED`; logi `[picking.finalize]`.

## 2026-06-04 — WMS Braki: filtry workflow, dedupe, detail, recovery finalize

- **Kolejka braków:** deduplikacja po `order_id` (lista + `consolidate_duplicate_open_issue_tasks` przy sync).
- **Status workflow:** `braki_workflow_service` — jeden status na zamówienie (`awaiting`, `relocation`, `relocation_partial`, `pick`, `ready_pack`, `pick_and_relocation`); `filter_counts` w `GET /wms/order-issue-tasks`.
- **Szczegół:** bogatsze `shortage_lines` (obraz, lokacja, SKU/EAN, `remaining_qty`, `pick_audit_summary`); front mapuje `location_code`, `image_url`.
- **Dogrywka:** logi `[recovery.finalize]`; po finalize `recalculate_order_shortage_state`; 503 z kontekstem błędu (nie goły komunikat).

## 2026-06-04 — WMS Braki: centralny workflow OMS/WMS (faza 2)

- **`braki_order_state_service.py`:** jedno źródło prawdy — `order_braki_workflow_complete` (recovery pick ≠ koniec; po sygnałach braków wymagane pełne pakowanie), `order_requires_shortage_handling`, awaiting OMS w kolejce, `nearest_pick_location_for_product`, `ensure_relocation_for_order_item_picks`, `build_order_issue_customer_fields`, logi `[braki.workflow]` / `[braki.shortage_sync]`.
- **Sync zamykania OPEN task:** `order_fulfillment_recompute.sync_shortage_workflow_for_order` używa `order_braki_workflow_complete`, nie zamyka po samym recovery.
- **OMS akcje:** `order.py` — usunięcie/zamiana/czeka + relocation przy zebranych sztukach; audyt `ORDER_LINE_REMOVED`, `ORDER_LINE_REPLACED`, `OMS_DECISION_*`, `RECOVERY_FINISHED`.
- **Zgłoszenie braku zamiennika:** `report-shortage` + `recovery_order_id`; `_line_ok_for_shortage_report`; log `[replacement.shortage]`.
- **API detail:** `customer_name`, `delivery_name`, phone, email, address; `nearest_location_*` na liniach; etykieta `"Brak lokalizacji"`.
- **Front:** filtry tylko `braki_workflow_status`; detail — klient i LOK z payloadu API.

## 2026-06-04 — report-shortage: zamiennik / recovery (400)

- **Przyczyna 400:** `report-shortage` wymagał kohorty statusu zbierania; zamówienia w dogrywce (BRAKI) nie przechodziły walidacji sesji.
- **Backend:** `recovery_order_id` + `order_item_id` → `forced_scope_ids` (jak `fixed_order_ids` na liście recovery); `_line_eligible_for_shortage_report`; logi `[report_shortage] ENTER/REJECT/line`; audyt `ORDER_LINE_SHORTAGE_REPORTED` / `REPLACEMENT_SHORTAGE_REPORTED` / `RECOVERY_SHORTAGE_REPORTED`.
- **API detail:** `order_item_id` na wierszu zamówienia w szczególe produktu; front przekazuje `recovery_order_id`, `order_ids`, `order_item_id` w POST.

## 2026-06-04 — Braki: ready_pack CTA, delete zamiennika, UX błędów

- **Workflow:** `resolve_braki_workflow_status` — OMS „czeka” nie blokuje `ready_pack` gdy zbieranie/recovery zakończone; `format_braki_issue_summary_line` zamiast „Brak aktywnej pracy…”.
- **Recovery finalize:** `recalculate_order_shortage_state` po domknięciu dogrywki.
- **DELETE pozycji:** `order_item_delete_service` + logi `[order.item.delete]`; audyt `REPLACEMENT_ITEM_REMOVED` / `ORDER_ITEM_REMOVED`.
- **Front:** CTA z `braki_workflow_status` (pakowanie vs zbieranie); tylko imię klienta; `extractApiErrorMessage` + toast przy usuwaniu linii.
