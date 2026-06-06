# Current context

## Active goal
Direct sales must use WZ as the sole warehouse-effect document — PA/FV are commercial only.

## WZ refactor (2026-06-04)
- Pipeline: `create_order → plan_allocations → create_payment → generate_documents (PA/FV) → create_wz → complete_session`
- Stock/FIFO only in `direct_sale/wz_service.py` via `stock_operation_issue_service.py`
- Removed `reserve_stock` / `issue_stock` from `complete_service.py`
- Schema: `document_series.warehouse_document_series_id`, `sale_document_stock_links`, `stock_documents` order/sale/session FKs
- Series UI: "Seria dokumentu magazynowego (WZ)" on SALE series edit
- Detail: PA/FV shows linked WZ badges + FIFO movements from WZ source

## Prior: PA/FV commercial parity
- Shared `create_sale_document`, canonical mapper, commercial detail UI
