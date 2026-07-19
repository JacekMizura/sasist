# current-context

## Active

**Legacy Pick recovery ready** — cart_id=2: finalize → CTA → Historia pobrań → Cofnij błędny Pick → zbierz z poprawnej LOC → finalize. No push until live recovery succeeds.

## Latest (2026-07-19)

- Undo by `Pick.id`; list product-picks; `PICK_LOCATION_STOCK_MISMATCH` + `failing_pick` in 409.
- Write-path effective stock gate unchanged. Finalize still strict.
- Quantity mode + per-allocation shortage unchanged.

## Notes

- Do not auto-FIFO relocate legacy picks.
- Global LIFO „Cofnij pobranie” still exists; prefer per-pick undo on MULTI.
