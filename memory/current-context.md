# Current context

## Active goal
Direct-sale pipeline: session `unit_price` = NET (catalog sale price); gross derived with VAT.

## Fixed (2026-06-04)
- Root cause: backend treated session `unit_price` as GROSS (`brutto_line_to_net_fields`) — fixed with `netto_line_to_gross_fields`
- `compute_direct_sale_session_total` / payment amounts now sum gross from net (5.00 net → 6.15 gross)
- Order creation stores `price_input_mode: NETTO`, `unit_price=5.00`, `line_gross_total=6.15`
- Prior pass: order API canonical financials, frontend display-only, WZ traceability, PA padding repair

## Prior: POS polish complete
- Print PDF wiring, formatMoneyPl, stationary-sale order profile, linked docs, terminology helpers
