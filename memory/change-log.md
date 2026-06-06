# Change log

## 2026-06-04 — Direct Sales API contract drift fix

- Canonical request schemas: `backend/api/contracts/direct_sales/` + `frontend/src/modules/directSales/contracts/`.
- Mappers for add-product and set-customer; no inline mutation payloads in hooks.
- Unified `[direct-sales.validation]` logging on 422 (endpoint, body, errors, missing fields, schema name).
- `POST /clear-customer` for anonymous sales; set-customer requires `customer_id >= 1`.
- Dev/staging network debug panel in `OperationalStatusPanel`.

## 2026-06-04 — Phase 3.6 Completion + Traceability

- Confirmation screen after complete with order/doc/payment/operator/stock traceability.
- Backend: `completion_read_service`, `/history`, `/session/{id}/completion`, `/documents/{id}/reprint`.
- OMS: direct sales + immediate fulfillment filters and list badges.

## 2026-06-04 — Phase 3.5 Direct Sales Terminal UX

- Rebuilt `/wms/direct-sales` as operational terminal (left/center/right/bottom layout).
- Split into `components/directSales/` and `hooks/directSales/`; page stays minimal.
- Suspended sessions panel with list/resume/cancel API.
- Keyboard-first: F1/F2/F3 payment, arrows+enter search, stock badges, Polish copy.

## 2026-06-04 — Operational features debug + enablement

- Backend: `operational_feature_resolver.py` with `[feature.resolve]` structured logs; `GET /operational/features/debug` (DEV/STAGING).
- Frontend: `OperationalStatusPanel`, `useOperationalStatus`, differentiated `DirectSalesUnavailable` messages.
- Fix: clear direct-sales endpoint blocks when features API returns `direct_sales: true` (root cause of false "wyłączona" message).
- Docs: incremental rollout env block in `docs/RAILWAY_BACKEND.md`.
