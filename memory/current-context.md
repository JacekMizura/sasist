# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.

## Latest (2026-07-18)

- **Shortage UX SSOT:** po pełnym „Zgłoś brak” `resolution_status=SHORTAGE` (≠ ZEBRANO / ≠ DO POBRANIA); remaining = req − picked − miss; lista odświeża się po powrocie.
- **Audit only:** WMS whole-order validation before Capacity — missing SSOT; see `memory/wms-order-validation-audit.md`.
- Picking corrections: undo draft pick, shortage after completed, confirm empty location (RK HYBRID).
- Prior: completed SKUs stay on product-lines; detail TypeError `_safe_touch_picking_session`.

## Notes

- Empty location requires HYBRID inventory mode (`apply_manual_stock_correction`).
- Classic picking does not use StockReservation — routing reads on-hand Inventory.
