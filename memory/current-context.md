# Current context

## Active goal
Product detail API (`GET /api/products/{id}`) — staged serialization, schema sync, degraded fallback.

## Product detail fix
- `backend/services/product_detail_service.py` — staged build, `[product.detail]` / `[product.detail.error]` logs, never HTTP 500 on enrichment failure
- `ensure_products_detail_read_schema()` — synchronous product/inventory/stock-doc column sync before detail GET
- Frontend edit/detail pages: safe mapper + "Nie udało się wczytać produktu."

## Prior (done)
Direct Sales complete() 500 fix + terminal UX hardening.

## Complete pipeline
- Step logging: `[direct-sales.complete]` per pipeline step
- Operational error codes: OUT_OF_STOCK, ALLOCATION_FAILED, ISSUE_FAILED, PAYMENT_FAILED, DOCUMENT_GENERATION_FAILED, SESSION_INVALID (no generic 500)
- Fallback allocation: `[direct-sales.fallback-allocation]` when STRICT plan fails but warehouse has stock
- Document step soft-fail: sale completes even if inline doc generation fails

## Terminal UX
- Complete errors: modal overlay (not layout-breaking panel)
- Payment: PaymentTerminalPanel + CashChangePanel (received/change, quick amounts)
- Location badges by zone; cart lines hide misleading "Brak (0)"
- LocationPickerModal for line location override
- TerminalStatusBar (sticky bottom)

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
