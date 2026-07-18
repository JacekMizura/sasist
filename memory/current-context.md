# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.
Cel: produkcyjny, spójny flow (CartLifecycle + Capacity + Event/Activity Log + CartStatus).

## Naprawione w audycie (2026-07-18)

- Duplikat indeksu `ix_activity_events_category` → crash `create_all`
- `ensure_activity_log_tables` zawsze reconciliuje indeksy (`IF NOT EXISTS`)
- PG allowlist: `ensure_carts_picking_lifecycle_columns` + lifecycle history/events

## Open (stabilizacja)

- Heartbeat / claim FE nieużywane
- READY/PACKING brak ścieżki admin abort (dead-end poza finish packing)
- Optimizer MULTI vs Capacity Engine
- GET product-lines mutuje lifecycle
