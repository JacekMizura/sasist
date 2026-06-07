# Current context

## Active goal
Retail/POS workflow for Direct Sales — document-first checkout, default retail customer, backend-canonical discounts.

## Implemented (2026-06-04)
- **Default retail customer:** `ensure_retail_customer()` auto-assigned on session create; PA keeps retail; FV switches to invoice customer flow
- **Document-first UX:** Paragon/FV toggle before customer; `CustomerPanel` only for FV with MF NIP lookup + CRM upsert
- **Discounts (backend SSOT):** `session_financials_service.py` — line + order %/amount; persisted on session/lines; order creation uses canonical totals
- **Discount settings:** `DirectSalesDiscountSettings` in backend + frontend schema; admin **Rabaty POS** section
- **Discount validation:** `discount_validation_service.py` enforces allow flags + max % on patch
- **Complete pipeline:** uses session `document_subtype` (normalized PA/FV → RECEIPT/INVOICE)
- **Frontend POS:** totals from `session.totals`, line/order discount UI, `LineDiscountPopover` on cart rows
- **NIP lookup:** MF whitelist API (`nip_lookup_service.py`); `httpx` added to requirements

## Prior: NET price pipeline
- Session `unit_price` = NET; `netto_line_to_gross_fields` for gross/VAT

## POS refinement (latest)
- Sidebar: Zawieś/Nowa sesja pinned bottom; discount badge left of qty; print via authenticated PDF blob
- Removed „Wygeneruj ponownie”; Dokumenty category in label templates + seed on startup
- Series `print_template_id` fix in `normalize_series_spec`; KOR preset id=4

## Direct Sales PDF + Dokumenty templates (latest)
- Fixed HTTP 500 on sale PDF: `map_sale_document()` keyword-args + `document_print_service`
- Puppeteer PDF pipeline with logging, fallback templates, `PdfRendererUnavailable` → 503
- Seeded built-in A4 templates (Paragon, FV, WZ, Korekta) in label manager Dokumenty section
- Frontend: PDF blob validation, clearer print errors, HTML/CSS editor for document templates

## WZ warehouse document cleanup
- Direct-sale WZ: status `completed` + workflow DONE; line pricing from order items; totals persisted
- List/detail API: `document_number`, `order_number`, `document_series_prefix`, `customer_name`
- Frontend WZ tab: no payment columns; status `ZREALIZOWANA`; Ilość/brutto columns; clean product images

## Manufacturing / Production module (latest)
- DB: `production_recipes`, `production_recipe_lines`, `production_orders`, `production_order_lines_snapshot`; `stock_documents.production_order_id`
- No `product_type` enum — role from recipe/bundle relations only
- Backend: recipe CRUD + activate/clone; production orders create/start/complete/cancel; completion → RW+PW docs, FIFO consume, unit cost
- API: `/api/production/*` (recipes + orders)
- Frontend: nav **Produkcja** (`/production`), product tab **Produkcja** + recipe editor; component usage list
- Tests: `backend/tests/test_production.py` (recipe math, schema, self-reference)

## Not yet / follow-up
- Production: create-order UI from product tab; mobile collector scan flow; stock reservations on start
- VIES EU fallback for NIP
- Manager approval + negative margin enforcement
- Quantity keypad modal, payment shortcut polish
- Hide retail system customer from CRM search
- Pre-existing frontend `tsc` errors in scanner hooks (unrelated)
