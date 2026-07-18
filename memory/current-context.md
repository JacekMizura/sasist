# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.

## Latest (2026-07-18)

- **CartLifecycle invariant:** panel UI status + `cart_service.clear_*` → detach only via CartLifecycle; `apply_fulfillment_state` no longer clears cart.
- WMS Validation hardening (System detach, G/H/J/L, batch routing).
- Shortage UX SSOT: `resolution_status=SHORTAGE`.

## Notes

- Empty location requires HYBRID inventory mode (`apply_manual_stock_correction`).
- Classic picking does not use StockReservation — routing reads on-hand Inventory.
