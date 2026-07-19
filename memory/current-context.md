# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.

## Latest (2026-07-19)

- **MULTI basket put SSOT:** product scan = unbound pending; basket scan allocates order_item. No FIFO destination before basket. List EAN consumed as PRODUCT_SCAN (pending). Series per confirmed basket.
- **POST /orders 500 ROOT:** phantom `offer_id` from GET sales-offers ensure without commit → fixed earlier.
- **Packing BASKET ghost count:** active queue requires live basket custody (`a8c6ee39`).

## Notes

- Create-order lines: `offer_id` only after explicit offer picker; otherwise `product_id` → backend default offer ensure (in create txn).
- `picking_handoff_mode` = provenance; packing queue = live custody.
