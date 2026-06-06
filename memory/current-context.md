# Current context

## Active goal
Direct Sales API contract single source of truth — fix 422 on add-product + set-customer.

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
