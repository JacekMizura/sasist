# Change Log

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
