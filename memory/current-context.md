# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.

## Latest (2026-07-18)

- **WMS Validation hardening:** System detach = CartLifecycle (`operator_user_id=None`); ERROR≠PRODUCT_NOT_PICKABLE; integration tests G/H/J/L; batch routing 1 call / N orders (6 SQL @10–1000).
- Shortage UX SSOT: `resolution_status=SHORTAGE`; remaining-first multi-order allocation.
- Prior: picking corrections, completed products on list, `_safe_touch` kwargs.

## Notes

- Empty location requires HYBRID inventory mode (`apply_manual_stock_correction`).
- Classic picking does not use StockReservation — routing reads on-hand Inventory.
