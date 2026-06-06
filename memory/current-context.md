# Current context

## Active goal
Direct Sales 422 resolved — missing `warehouse_id` query param on router dependency.

## Root cause (confirmed)
`direct_sales` router uses `Depends(operational_sales_sessions_for_request)` requiring **both** `tenant_id` and `warehouse_id` query params. Frontend mutations sent only `tenant_id` → FastAPI 422 `missing_query: warehouse_id` (before body validation).

## Contract layout
- Backend: `backend/api/contracts/direct_sales/` (`AddDirectSalesProductRequest`, `SetDirectSalesCustomerRequest`)
- Frontend: `frontend/src/modules/directSales/contracts/` + `mappers/`
- Validation logs: `[direct-sales.validation]` in Railway for add-product + set-customer 422s

## Customer attach/detach
- `POST /set-customer` — body `{ customer_id: int >= 1 }`
- `POST /clear-customer` — anonymous sale (no body)

## Add product
- Body `{ product_id, quantity }` only; preferred location applied via line patch after add

## Debug (dev/staging)
- `OperationalStatusPanel` → Direct-sales network trace (req/res/422 detail)

## Rollout env (unchanged)
- `FEATURE_OPERATIONAL_SALES=1`, `FEATURE_OPERATIONAL_SALES_SESSIONS=1`
