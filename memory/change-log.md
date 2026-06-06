# Change log

## 2026-06-06 — Direct sales documents unified with standard pipeline

- **Numbering:** `create_sale_document` uses `allocate_next_document_number` (YEAR/MONTH/padding/reset) — no raw template literals.
- **VAT:** Direct sales brutto input → net/VAT on `order_items` via `sale_document_financials`; `order.value` = gross total.
- **Sale document row:** Extended `sale_documents` with totals, payment linkage, `document_type_id`, `document_subtype`.
- **API:** `GET /sale-documents/{id}` full detail (buyer/seller, VAT table, lines, payments).
- **Frontend:** List rows link to `/documents/sales/:id` (+ alias `/dokumenty/sprzedaz/:id`); `DocumentsSalesDetailPage`.

## 2026-06-06 — Direct sales complete idempotency

- `try_idempotent_complete_result`, `COMPLETING` status, structured session state logs.

## 2026-06-06 — Direct sales complete 500 (reserve_stock)

- `record_inventory_movement` flush; schema guard for reservation columns.

## 2026-06-06 — ResolvedDirectSalesSettingsProvider route wiring

- Settings layout wraps direct-sales route boundary.
