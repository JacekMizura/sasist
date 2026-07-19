# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.

## Latest (2026-07-19)

- Finalize all-shortage: setting wired to DB (`disable_auto_detach_missing_orders_from_carts`); heal READY_FOR_PACKING; detach via CartLifecycle SSOT.
- Prod CART-0001 stuck = prior finalize left READY_FOR_PACKING without detach; re-finalize after deploy heals.
- Deploy + verify: all-shortage → cart AVAILABLE, orders.cart_id NULL (fresh DB).

## Notes

- Empty location requires HYBRID inventory mode (`apply_manual_stock_correction`).
- Classic picking does not use StockReservation — routing reads on-hand Inventory.
- Shortage during picking ≠ pre-pick WMS Validation (do not auto-detach on shortage).
- Finalize shortage ≠ leave on cart — detach via `finish_picking_after_wms_finalize`.
