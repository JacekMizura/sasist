# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.

## Latest (2026-07-19)

- **POST /orders 500 (prod 6b70515e):** diagnostyka only — `ORDER_CREATE_TRACE` + `logger.exception`. Brak potwierdzonego ROOT CAUSE bez nowego loga. Nie zakładaj handoff; sprawdź stage w logach po deploy.
- **Orphan PACKING cart:** `finish_packing` release bug → `release_empty_orphan_cart` + admin-release CASE C (`ea6a085f`, nie na prod jeśli prod=6b70515e).
- Packing finish baskets / handoff / cartless — jak wcześniej.

## Notes

- Po deploy diagnostyki: jeden POST /orders → szukaj `ORDER_CREATE_TRACE` / `ORDER_CREATE_ERROR` w Railway Deploy Logs (stderr + logger.exception).
- Nie retry create jeśli log ma `committed=True`.
