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

## Not yet / follow-up
- VIES EU fallback for NIP
- Manager approval + negative margin enforcement
- Quantity keypad modal, payment shortcut polish
- Hide retail system customer from CRM search
- Pre-existing frontend `tsc` errors in scanner hooks (unrelated)
