# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.

## Latest (2026-07-19)

- **GET /order-issue-tasks 500 (prod):** request-path ensure omijało `archived_at` — ORM SELECT → column missing. Fix lokalny (osobny commit); Railway logs niedostępne (Unauthorized) — PROD SCHEMA VERIFIED: NO.
- **CARTLESS PICKING:** DB `bulk` / UI `cart_no_scan` = sesja bez WarehouseCart (`picking_session_id` SSOT). Usunięto default-cart bootstrap dla tego trybu.
- **Wózki:8 / empty CART:** semantic drift tile(A raw status) vs assign(B eligibility+gate); empty fail → `claim_cart` → false PRZYPISANY. Fix: assignable count SSOT, `PICK_ASSIGN_TRACE`, release empty ASSIGNED on zero assign.
- AUTO-DETACH CART-0001: PASS on prod after deploy.

## Notes

- Cartless: `order.cart_id` i `session.cart_id` pozostają NULL przez cały lifecycle.
- `cart_scan` / `baskets` nadal CartLifecycle SSOT — bez zmian semantyki.
- Legacy bulk+CART-xxxx: bez szerokiego auto-heal; tylko kontrolowany repair jeśli potrzeba.
