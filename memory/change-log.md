# Change log

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
