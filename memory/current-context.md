# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.

## Latest (2026-07-19)

- AUTO-DETACH CART-0001: PASS on prod after deploy.
- Follow-up: GET `/order-issue-tasks` 500 — dialect-aware schema + sync rollback + repair savepoint; shortage → 1 OrderIssueTask/order (idempotent).
- Stale hub „Do zebrania”: cart-scoped refetch after scan; no status-level stats while products loading.

## Notes

- Empty location requires HYBRID inventory mode (`apply_manual_stock_correction`).
- Classic picking does not use StockReservation — routing reads on-hand Inventory.
- Shortage during picking ≠ pre-pick WMS Validation (do not auto-detach on shortage).
- Finalize shortage ≠ leave on cart — detach via `finish_picking_after_wms_finalize`.
- `ensure_picking_shortage_support` remains SQLite-gated for report-table CREATE; column ALTERs via `ensure_wms_picking_shortage_settings_columns` (PG allowlist).
