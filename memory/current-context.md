# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.

## Latest (2026-07-18)

- **ZGŁOŚ BRAK first-submit:** autoflush=False wipe of missing qty fixed; idempotent double-submit; order-aware logs; red SHORTAGE; counters braki≠zebrane.
- CartLifecycle invariant: panel UI status + `cart_service.clear_*` → detach only via CartLifecycle.
- WMS Validation hardening (System detach, G/H/J/L, batch routing).

## Notes

- Empty location requires HYBRID inventory mode (`apply_manual_stock_correction`).
- Classic picking does not use StockReservation — routing reads on-hand Inventory.
- Shortage during picking ≠ pre-pick WMS Validation (do not auto-detach on shortage).
