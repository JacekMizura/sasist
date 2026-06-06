# Change log

## 2026-06-04 — Rack editor sidebar UX + save flow

- Rack name persists via layout state + PUT payload; `[rack.rename]` logging (local + persisted on save).
- Properties panel: overlay drawer (does not cover Zapisz układ), close/toggle/ESC/backdrop, resizable + compact mode.
- Internal layout modal: breadcrumb navigation, back, ESC; elevation panel top offset.

## 2026-06-04 — Direct sales status settings unified with order panel

- Replaced hardcoded status strings with `order_ui_statuses.id` fields.
- Shared `order_status_select_service` for `/order-statuses` (active only, subgroup labels).
- Settings UI: dynamic grouped dropdown + optional workflow status fields.

## 2026-06-04 — Product detail API 500 fix

- `GET /products/{id}` routed through `product_detail_service` with per-stage try/catch and degraded minimal payload.
- Logging: `[product.detail]` (stage success) and `[product.detail.error]` (product_id, tenant_id, stage, exception).
- `ensure_products_detail_read_schema()` + `ensure_products_sku_barcode_columns()` for sync schema before detail read.
- Null-safe supplier/manufacturer enrichment; frontend edit page catches mapper failures.

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
