# current-context

## Active

Order Card Summary — restore full functionality after over-simplification:

- Restored from pre-density baseline (`26e3cf74`): full packaging (`pairRecommendationColumns`), Safe Order card, WMS phase chips, Listy przewozowe card, Wideo WMS section, Wiadomość do klienta, full `OrderDetailSectionCard` chrome
- Added summary products header: Spakuj + Dodaj produkt + Dodaj zestaw (wired to existing modals)
- Shipping/payment Zapisz/Anuluj only when draft differs from saved order (dirty-only)
- Hierarchy layout (context → products → helpers) kept; no API/logic changes beyond dirty gate

## Constraint

Mockup = composition/hierarchy only. Never remove existing order-card capabilities when restyling.
