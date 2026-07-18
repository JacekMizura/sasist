# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.

## Latest (2026-07-18)

- Prod detail 500 `request_id=7c0e7367…`: **TypeError** `_safe_touch_picking_session(db, …)` vs `**kwargs` — fixed all call-sites to `db=db`.
- Deploy required before re-checking production request.
- Do **not** claim full WMS flow fixed until manual prod verify after deploy.

## Prior

- bundle_component_index normalize (deployed in `40ba587`) — separate from this TypeError.
- HTTP 500 diagnostics: logs under `request_id`; body opt-in `DEBUG_HTTP_500` only.
