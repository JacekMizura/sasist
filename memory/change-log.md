# Change log

## 2026-06-06 — Sale document UI/data unification

- **`sale_document_mapper.py`** — single canonical DTO for list + detail + Direct Sales summary.
- Financials always recomputed from order lines (never stale `sale_documents.total_*`).
- Payment: `payment_method`, `payment_status`, `payment_label_pl` on all surfaces.
- Legacy numbers: `PA/{YEAR}/{MONTH}/1` → display "Numer legacy (wymaga korekty)".
- **`CommercialSaleDocumentView`** — shared commercial detail layout (buyer/seller, VAT, payment, warehouse, history).
- Brutto line gross stored in `order_items.metadata_json.line_gross_total`; legacy single-line fallback uses `order.value`.

## 2026-06-06 — Direct sales documents unified with standard pipeline

- Numbering via `allocate_next_document_number`; VAT brutto→net; payment on `sale_documents`.

## Prior: complete idempotency, provider wiring, reserve_stock fix
