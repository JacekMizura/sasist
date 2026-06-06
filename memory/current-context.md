# Current context

## Active goal
Operational feature visibility + enablement diagnostics (no classic WMS / picking / packing changes).

## Feature resolution (backend)
Priority: warehouse override → tenant override → global env → default false. NULL/missing DB scope columns inherit (do not override `env=true`).

## Rollout env (incremental)
- `FEATURE_OPERATIONAL_SALES=1`
- `FEATURE_OPERATIONAL_SALES_SESSIONS=1`
- `FEATURE_OPERATIONAL_RUNTIME=0`
- `FEATURE_REPLENISHMENT_ENGINE=0`
- `DEBUG_OPERATIONAL_FEATURES=1` on staging for `/api/operational/features/debug`

## Frontend diagnostics
- `console.info("[operational.features]", payload)` on successful feature load
- `OperationalStatusPanel` on `/wms/direct-sales` and `/wms/operations` (DEV/staging only)
- Differentiated unavailable copy: OFF vs network vs backend
- Stale endpoint blocks cleared when `direct_sales=true` from features API
