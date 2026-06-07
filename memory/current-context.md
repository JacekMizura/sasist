# Current context

## Active goal
Direct Sales POS polish — Polish UX, print templates, financial consistency, retail numbering.

## Completed (2026-06-04)
- Central labels: `operational_labels.py` (backend), `directSalesTerminology.ts` (frontend)
- Terminology: Sprzedaż stacjonarna, Wydanie natychmiastowe
- Print: HTML templates PA/FV/WZ in `backend/templates/`, PDF APIs `/sale-documents/{id}/pdf`, stock HTML PDF
- Numbering: `padding_length=0` → no leading zeros; PA series default padding 0
- Financials: gross-anchored in order API when `line_gross_total` metadata present; `compute_direct_sale_session_total`
- Order list: direct-sale customer → Sprzedaż stacjonarna, delivery → Odbiór osobisty

## Prior: infrastructure
- E2E complete works on PostgreSQL after schema tier0 + session lock fixes
