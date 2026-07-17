# Architecture — Cart Lifecycle

## Ownership (SSOT)

**CartLifecycleService** (`backend/services/cart_picking_lifecycle_service.py`)
jest jedynym właścicielem lifecycle wózków.

Żaden nowy kod nie może bezpośrednio modyfikować:

- `carts.status`
- `current_session_id`
- `assigned_user` / `assigned_user_id`
- `packing_user` / `packing_user_id`
- `order.cart_id`

Każda taka zmiana musi przechodzić przez CartLifecycleService.

## Event Log (biznesowy, PL)

Tabela `cart_lifecycle_events`:

| Pole | Rola |
|------|------|
| `event_code` | kod systemowy — logika, filtry, KPI |
| `description` | opis PL — wyłącznie UI |
| `severity` | INFO \| SUCCESS \| WARNING \| ERROR \| AUDIT |

Zapis wyłącznie przez `CartLifecycleService._record_event`.  
API: `GET /wms/carts/{id}/events`.  
Uogólnienie do `audit_events`: **nie teraz** — patrz `memory/audit-events-generalization-analysis.md`.

## Active Picking (Aktywna kompletacja)

Snapshot w `carts.current_task_json` (bez encji Task).

API: `GET /wms/carts/{id}/active-picking` (+ alias `/current-task`).
Pola: batch/session, operator, zamówienia, produkty, confirmed/remaining, progress, started_at.

## Public API (mutacje)

| Operacja | Funkcja |
|----------|---------|
| claim | `claim_cart` |
| start picking | `start_picking` |
| cancel | `cancel_picking` |
| finish picking | `finish_picking` |
| start packing | `start_packing` |
| finish packing | `finish_packing` |
| release | `release_cart` |

Historia statusów i `current_task_json` zapisują się wyłącznie przez
`apply_cart_transition` wewnątrz tego serwisu.

## Transaction / concurrency

- Mutacje: `flush` w serwisie; **commit wyłącznie u wywołującego** (API / worker).
- Mutacje biorą `SELECT … FOR UPDATE` na wierszu `carts`.
- Jedna zmiana statusu → dokładnie jeden wpis w `cart_lifecycle_history`
  (`prev != new`); refresh tego samego statusu nie pisze historii.

## Invariants (skrót)

| Status | Reguły |
|--------|--------|
| AVAILABLE | brak sesji, assigned, packing, current_session_id |
| ASSIGNED | brak sesji / current_session_id / order.cart_id; jest assigned_user |
| PICKING | otwarta PickingSession + current_session_id |
| READY_FOR_PACKING | brak sesji picking; order.cart_id nadal |
| PACKING | packing_user; brak sesji picking |

Szczegóły: `assert_cart_lifecycle_invariants`, `memory/cart-lifecycle-writer-audit.md`.
