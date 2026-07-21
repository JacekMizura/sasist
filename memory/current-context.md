# current-context

## Active

**LIVE BASKET_PRODUCT_MISMATCH / empty eligible** — local commit pending; **do not push** until user asks.

## Root cause (code-proven)

`list_eligible_basket_allocations` previously skipped lines with `wms_picking_line_status='picked'` even when
`rem = qty − pick_events − missing > 0`. Detail `orders[].quantity_to_pick` used rem only → UI showed
`S-1-2 unresolved=1` while write eligible=`[]` → toast „Oczekiwane: —”.

Draft-Pick-before-put was **not** the LIVE formula bug in quantity mode (Pick+event written at basket confirm).

## Fix SSOT

- Eligibility = rem > 0 **and** `Order.basket` on active cart (heal stale `picked` when rem>0).
- `resolve_allocation_for_basket_scan` accepts **only** eligible rows (no `CartBasket.order_id` fallback).
- 409 `BASKET_PRODUCT_MISMATCH` extras: `mismatch_diagnostics_payload` (eligible + rejected_allocations + scanned_*).

## Invariant

IF cohort line rem>0 AND basket on active cart → basket ∈ eligible_basket_destinations **and** confirm accepts it.
