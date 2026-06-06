# Change log

## 2026-06-04 — Operational features debug + enablement

- Backend: `operational_feature_resolver.py` with `[feature.resolve]` structured logs; `GET /operational/features/debug` (DEV/STAGING).
- Frontend: `OperationalStatusPanel`, `useOperationalStatus`, differentiated `DirectSalesUnavailable` messages.
- Fix: clear direct-sales endpoint blocks when features API returns `direct_sales: true` (root cause of false "wyłączona" message).
- Docs: incremental rollout env block in `docs/RAILWAY_BACKEND.md`.
