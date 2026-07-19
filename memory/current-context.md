# current-context

## Active

**cart_id=2 LIVE finalize 409** = almost certainly **legacy bad Pick rows** (same location over-allocated), not a new write-path regression. Redeploy does not rewrite old drafts. Use `FINALIZE_PICK_FAILED.failing_pick` after next finalize click. No push.

## Latest (2026-07-19)

- Hard gate: pending Pick=3 @ LOC-A stock=4 → qty=5 rejected `QUANTITY_EXCEEDS_LOCATION_STOCK`.
- Diagnostics on finalize inventory loop; tests `test_wms_finalize_legacy_location_mismatch.py`.
- Recovery: undo LIFO / explicit admin split — not auto during finalize.

## Notes

- Detail `quantityMode` suppresses legacy pending/series EAN+1. List MULTI EAN = navigate only (no pending).
- BULK/cartless still use cohort shortage budget without `order_item_id`.
- `picking_handoff_mode` = provenance; packing queue = live custody.
