# Current context

## Active goal
Phase 3.6 — Direct Sales Completion + Stock Traceability UI.

## Completion flow
- `complete()` shows `DirectSalesConfirmationScreen` (no silent reset)
- Traceability: lines, stock deltas, movement timeline, payment + document detail
- `GET /api/direct-sales/history`, `GET /api/direct-sales/session/{id}/completion`
- `POST /api/direct-sales/documents/{job_id}/reprint` — explicit re-generation
- Error recovery panel for payment/document/issue failures (session stays active)

## OMS visibility
- Order list: badges Sprzedaż bezpośrednia / Natychmiastowe wydanie
- Filters: `order_channel=DIRECT_SALE`, `fulfillment_mode=IMMEDIATE`

## Rollout env (unchanged)
- `FEATURE_OPERATIONAL_SALES=1`, `FEATURE_OPERATIONAL_SALES_SESSIONS=1`
- Runtime/replenishment remain OFF until validated
