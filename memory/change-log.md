# Change Log

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
