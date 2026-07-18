# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.

## Latest (2026-07-18)

- Picking corrections: undo draft pick, shortage after completed, confirm empty location (RK HYBRID).
- Prior: completed SKUs stay on product-lines; detail TypeError `_safe_touch_picking_session`.

## Notes

- Empty location requires HYBRID inventory mode (`apply_manual_stock_correction`).
- Classic picking does not use StockReservation — routing reads on-hand Inventory.
