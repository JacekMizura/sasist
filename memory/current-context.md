# current-context

## Active

Panel **Activity Log** (OMS): wspólna historia obiektów — `activity_events` + linki N:N, UI `ActivityLogPanel`.
Osadzony w: zamówienia, edytory wózków (bulk/multi), fleet detail, regały kompletacyjne (edit/preview).

Capacity Engine = SSOT occupancy; Cart.status = lifecycle only.
WMS user messaging SSOT + Event Log PL (terminal) — osobny tor od panel Activity Log.

## Next

- Dual-write OMS order events → `activity_events` (obecnie fallback `order_activity_logs`)
- Zapisy dla rack lifecycle → Activity Log
- Filtry UI (severity / category / operator / daty) — API już gotowe
- Osadzenie w produktach / produkcji / zwrotach / dokumentach gdy powstaną widoki
