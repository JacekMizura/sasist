# Current context

## Active goal
Direct sales PA/FV documents must behave identically to standard sales documents (numbering, VAT, payment, detail view).

## Direct sales documents fix (2026-06-06)
- Shared path: `document_generation_worker` → `create_sale_document` (no separate receipt builder).
- Numbering: `document_number_service.allocate_next_document_number`.
- Brutto → net/VAT at order creation (`order_service` + `sale_document_financials`).
- `sale_documents` extended: totals, payment_id/method/status, document_type_id.
- Detail: `GET /sale-documents/{id}`, UI `/documents/sales/:id`.

## Prior: Complete pipeline + settings provider + idempotency
- Complete E2E reliable; provider at route boundary; duplicate complete returns prior result.
