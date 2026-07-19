# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.

## Latest (2026-07-19)

- **MULTI quantity + per-allocation shortage:** SELECT_PRODUCT → SELECT_BASKET → qty modal → Pick; shortage scoped to `order_item_id`/basket; unresolved = required − picked − shortage. Product-level FIFO shortage blocked on baskets carts.
- **Packing BASKET ghost count:** active queue requires live basket custody (`a8c6ee39`).

## Notes

- Detail `quantityMode` suppresses legacy pending/series EAN+1. List MULTI EAN = navigate only (no pending).
- BULK/cartless still use cohort shortage budget without `order_item_id`.
- `picking_handoff_mode` = provenance; packing queue = live custody.
