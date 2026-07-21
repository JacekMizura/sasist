# current-context

## Active

**MULTI quantity-mode server-side `source_lock`** — local commit pending/ready; **do not push** (incl. prior `2de7345a`).

## Invariant

After source accept → `basket_put.source_lock` in session metadata → confirm-basket-put uses lock for `Pick.location_id` → live effective stock revalidation → clear lock on success only.

`body.location_id` = compatibility check only (`SOURCE_LOCATION_MISMATCH` on mismatch). Not Inventory reservation.

## Storage

`WmsOperationSession.metadata_json.basket_put.source_lock` (existing basket_put block).
