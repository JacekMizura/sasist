# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.

## Latest (2026-07-19)

- Prod: shortage first-submit list race (dedupe force + product_line snapshot); banner removed; finalize orphan shipping FK sanitize + safe UX; classify unchanged (not bulk PACKING).
- Deploy readiness: code ready; **production orphan count / one real shortage submit NOT VERIFIED** until deploy + audit script on prod DB.

## Notes

- Empty location requires HYBRID inventory mode (`apply_manual_stock_correction`).
- Classic picking does not use StockReservation — routing reads on-hand Inventory.
- Shortage during picking ≠ pre-pick WMS Validation (do not auto-detach on shortage).
- Orphan shipping FK repair: prefer map via label → local ShippingMethod; else NULL (nullable FK); keep free-text `shipping_method`.
