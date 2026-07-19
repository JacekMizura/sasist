# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.

## Latest (2026-07-19)

- **Packing BASKET ghost count:** entry „Zeskanuj koszyk (1)” vs basket 404 EMPTY — handoff provenance ≠ active custody. SSOT queue requires live basket dual-link + not automation_finished.
- **POST /orders 500:** diagnostyka `ORDER_CREATE_TRACE` (`ec58cd21`); ROOT CAUSE prod nadal UNKNOWN bez nowego loga.
- **Orphan PACKING cart:** `release_empty_orphan_cart` (`ea6a085f`).

## Notes

- `picking_handoff_mode` = immutable provenance; live queue = cart_id / basket custody + packing state − finalized.
- Magazyn→Wózki orphan: admin-release heal, nie cancel-session.
