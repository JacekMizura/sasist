# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.

## Latest (2026-07-19)

- **Orphan PACKING cart:** `finish_packing` release bug (session-heal remaining + skip clear when cart_id NULL) → stuck PACKING + `order_packed`. Fix: clear always, cart_id-only remaining, `release_empty_orphan_cart` + admin-release CASE C. cancel-session 409 for PACKING remains correct.
- **Packing finish baskets 400:** ROOT = `CART_NOT_IN_PACKING` po pipeline gdy MULTI nadal `READY_FOR_PACKING` (basket-first bez skanu wózka). Fix: allow READY + preflight przed mutacją + `PACKING_FINISH_TRACE` + idempotent retry.
- **Packing handoff:** `picking_handoff_mode` SSOT; scoped CART/BASKET/CARTLESS queues; basket-first entry.
- **Packing flow:** first list EAN scan packs (+1) via `POST /packing/resolve-ean/scan`; AutoActions only after `wms_packing_automation_finished_at`; no fake ✓✓.
- **GET /order-issue-tasks 500 (prod):** request-path ensure omijało `archived_at` — ORM SELECT → column missing. Fix lokalny (osobny commit); Railway logs niedostępne (Unauthorized) — PROD SCHEMA VERIFIED: NO.
- **CARTLESS PICKING:** DB `bulk` / UI `cart_no_scan` = sesja bez WarehouseCart (`picking_session_id` SSOT). Usunięto default-cart bootstrap dla tego trybu.
- **Wózki:8 / empty CART:** semantic drift tile(A raw status) vs assign(B eligibility+gate); empty fail → `claim_cart` → false PRZYPISANY. Fix: assignable count SSOT, `PICK_ASSIGN_TRACE`, release empty ASSIGNED on zero assign.
- AUTO-DETACH CART-0001: PASS on prod after deploy.

## Notes

- Cartless: `order.cart_id` i `session.cart_id` pozostają NULL przez cały lifecycle.
- `cart_scan` / `baskets` nadal CartLifecycle SSOT — bez zmian semantyki.
- Legacy bulk+CART-xxxx: bez szerokiego auto-heal; tylko kontrolowany repair jeśli potrzeba.
- Packing SSOT: packed qty = `order_items.packing_quantity_packed` vs `order_item_required_pack_qty`; complete = snapshot `lines_packed_complete`; FINALIZED UI = automation_finished_at.
- Finish baskets: `mode=baskets` = UI label → scope `picking_handoff_mode=BASKET`; cart_id opcjonalny (basket-first).
- Empty orphan PACKING: Magazyn→Wózki „Zwolnij wózek” → `admin-release` → `release_empty_orphan_cart` (nie `/picking/cancel-session`).
