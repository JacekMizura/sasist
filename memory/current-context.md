# Current context

## Active goal
Tier 0 ORM schema reconciliation for warehouse/document tables — fixes `stock_documents.document_series_id` drift on PostgreSQL.

## Real exception (PostgreSQL production)
- `column "document_series_id" of relation "stock_documents" does not exist`
- WZ creation reached; schema drift blocked `assign_series_number_to_stock_document`
- Fix: `ensure_tier0_document_warehouse_schema()` at startup (not runtime)

## Tier 0 document/warehouse sync (startup only)
- `document_series`, `sale_documents`, `stock_documents`, `stock_document_items`, `sale_document_stock_links`, `order_documents`
- Helper: `_ensure_orm_columns_for_model` (dialect-safe `CreateColumn`)
- No ALTER TABLE during `/complete`, WZ, or payment

## Prior fixes
- `sale_documents` DATETIME → TIMESTAMP ORM sync
- PendingRollbackError / generate_documents swallow removed
- `FOR UPDATE` + joinedload split in session lock
