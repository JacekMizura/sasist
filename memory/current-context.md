# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.

## Latest (2026-07-19)

- Finalize all-shortage: CartLifecycle detach + release (nie READY_FOR_PACKING z BRAKI na wózku).
- Activity logs: operator column SSOT; newest-first; no duplicate shortage ActivityEvent.
- Deploy: require prod verify — all-shortage finalize cart empty + one shortage log row with Użytkownik.

## Notes

- Empty location requires HYBRID inventory mode (`apply_manual_stock_correction`).
- Classic picking does not use StockReservation — routing reads on-hand Inventory.
- Shortage during picking ≠ pre-pick WMS Validation (do not auto-detach on shortage).
- Finalize shortage ≠ leave on cart — detach via `finish_picking_after_wms_finalize`.
