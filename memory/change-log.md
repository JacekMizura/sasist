# Change Log

## 2026-06-04 — WMS Braki: filtry workflow, dedupe, detail, recovery finalize

- **Kolejka braków:** deduplikacja po `order_id` (lista + `consolidate_duplicate_open_issue_tasks` przy sync).
- **Status workflow:** `braki_workflow_service` — jeden status na zamówienie (`awaiting`, `relocation`, `relocation_partial`, `pick`, `ready_pack`, `pick_and_relocation`); `filter_counts` w `GET /wms/order-issue-tasks`.
- **Szczegół:** bogatsze `shortage_lines` (obraz, lokacja, SKU/EAN, `remaining_qty`, `pick_audit_summary`); front mapuje `location_code`, `image_url`.
- **Dogrywka:** logi `[recovery.finalize]`; po finalize `recalculate_order_shortage_state`; 503 z kontekstem błędu (nie goły komunikat).
