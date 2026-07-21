# current-context

## Active

**MULTI basket put — source location provenance** — local commit; **do not push**.

## Root cause (LIVE brck1-B02 → 400 route)

1. `confirm-basket-put` quantity mode validates stock at FE `location_id`, but `record_wms_quick_pick` re-checked greedy `PickingRoutingService` (physical Inventory, ignores draft Picks) → A10 still preferred, A23 rejected.
2. API `_do_record` preferred stale series `location_id` over request body.
3. ValueError → HTTP 400 plain string → FE `UNKNOWN_SCAN_CODE`.

## Fix

- `skip_route_location_check` when basket-bound (`scope_order_id`)
- Pass/trust request `location_id` into Pick write
- Structured `{code,message}` for location errors; FE catalog for SOURCE_LOCATION_*
