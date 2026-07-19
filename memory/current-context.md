# current-context

## Active

**LIVE finalize-cart 409** (product #192, cart_id=2) — audit done, **no fix / no push**.
Do not change quantity flow or shortage flow that just worked.

## Latest (2026-07-19)

- Finalize deducts only pending `Pick.quantity` at `Pick.location_id`. Error `wymagane 5` = that Pick row’s qty. Shortage not deducted. Stock only at finalize.
- Blocked on live Pick dump (location_id / per-loc aggregation). Suspected FE multi-loc stamp to `locations[0]`.
- **MULTI quantity + per-allocation shortage:** still correct; do not regress.

## Notes

- Detail `quantityMode` suppresses legacy pending/series EAN+1. List MULTI EAN = navigate only (no pending).
- BULK/cartless still use cohort shortage budget without `order_item_id`.
- `picking_handoff_mode` = provenance; packing queue = live custody.
