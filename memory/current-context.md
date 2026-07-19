# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.

## Latest (2026-07-19)

- **POST /orders 500 ROOT:** phantom `offer_id` from GET sales-offers ensure without commit → `offer_not_found`. Fixed commit + FE product_id default path + 400 domain map.
- **Packing BASKET ghost count:** active queue requires live basket custody (`a8c6ee39`).
- **Orphan PACKING cart / ORDER_CREATE_TRACE:** earlier commits.

## Notes

- Create-order lines: `offer_id` only after explicit offer picker; otherwise `product_id` → backend default offer ensure (in create txn).
- `picking_handoff_mode` = provenance; packing queue = live custody.
