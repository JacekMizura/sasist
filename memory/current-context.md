# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.

## Latest (2026-07-19)

- **MULTI basket put:** product context (detail `product_id`) ≠ pending. Basket without pending activates series Pick=0; pending means physical qty awaiting basket. Click: basket→EAN→+1. Scan entry: EAN→pending→basket→+1.
- **POST /orders 500 ROOT:** phantom `offer_id` from GET sales-offers ensure without commit → fixed earlier.
- **Packing BASKET ghost count:** active queue requires live basket custody (`a8c6ee39`).

## Notes

- Create-order lines: `offer_id` only after explicit offer picker; otherwise `product_id` → backend default offer ensure (in create txn).
- `picking_handoff_mode` = provenance; packing queue = live custody.
