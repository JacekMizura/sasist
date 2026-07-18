# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.

## Naprawione (2026-07-18, latest)

- **product-lines/detail HTTP 500:** `bundle_component_index` NULL/`or 0` → ValidationError L1867.
  Canonical normalize in `bundle_component_index.py`; reindex in UX index + picking/packing trees + scan.
  Skip non-components; per-bundle try/except; no blind `max(1,…)`.
- **HTTP 500 body:** `DEBUG_HTTP_500` opt-in only (no production leak). Logs keep full stack + `request_id`.

## Open

- Heartbeat / claim FE
- READY/PACKING admin abort
- Optimizer MULTI vs Capacity
- GET product-lines mutates lifecycle
