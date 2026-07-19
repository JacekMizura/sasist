# current-context

## Active

**WRITE PATH location provenance fix** — MULTI must scan/select SOURCE location before basket quantity put. Finalize remains strict Pick×location (no redistribute). No push.

## Latest (2026-07-19)

- LIVE finalize 409 (product 192 qty=5 vs avail=1) → root: FE `locations[0]` + no location stock gate at write.
- Fix: `wms_basket_put/location_stock.py` effective available; BE codes `PICK_LOCATION_REQUIRED` / `QUANTITY_EXCEEDS_LOCATION_STOCK`; FE multi-loc gate + modal max.
- Quantity flow (null → QUANTITY_REQUIRED, qty → PUT) unchanged.

## Notes

- Detail `quantityMode` suppresses legacy pending/series EAN+1. List MULTI EAN = navigate only (no pending).
- BULK/cartless still use cohort shortage budget without `order_item_id`.
- `picking_handoff_mode` = provenance; packing queue = live custody.
