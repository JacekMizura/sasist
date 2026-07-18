# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.
Cel: produkcyjny, spójny flow (CartLifecycle + Capacity + Event/Activity Log + CartStatus).

## Naprawione w audycie (2026-07-18)

- Duplikat indeksu `ix_activity_events_category` → crash `create_all`
- `ensure_activity_log_tables` zawsze reconciliuje indeksy (`IF NOT EXISTS`)
- PG allowlist: `ensure_carts_picking_lifecycle_columns` + lifecycle history/events
- **Event Log:** legacy `event_type NOT NULL` → DROP po backfill do `event_code` (NotNullViolation 500)
- **Schema health:** WMS audit/sessions/picks/orders timeline na PG allowlist; carts capacity healed; report `memory/schema-health-check.md`
- **Wózki:** SSOT `list_orders_on_cart`; sekcja Przypisane zamówienia; Activity Log z numerami; jedna Pojemność
- **Wózki close-out:** pełny audyt spójności A–E (`memory/carts-consistency-audit.md`); regresje volume/clear/finish_packing/Activity refresh naprawione
- **Wózki UX:** odłączenie 1 zamówienia (lifecycle), tooltips numer/pozycje, Activity Log expand + inline numery

## Open (stabilizacja)

- Heartbeat / claim FE nieużywane
- READY/PACKING brak ścieżki admin abort (dead-end poza finish packing)
- Optimizer MULTI vs Capacity Engine
- GET product-lines mutuje lifecycle
