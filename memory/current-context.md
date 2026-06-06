# Current context

## Active goal
Phase 3.5 — Direct Sales Terminal UX (usable operator flow). Classic WMS untouched.

## Direct sales terminal
- Layout: left (search + suspended) · center (lines) · right (customer + document + payment) · bottom scanner bar
- Components: `frontend/src/components/directSales/`
- Hooks: `frontend/src/hooks/directSales/`
- `DirectSalesPage` < 10 LOC — logic in `useDirectSalesTerminal` + `DirectSalesLayout`

## New backend endpoints
- `GET /api/direct-sales/sessions/suspended`
- `POST /api/direct-sales/session/{id}/resume`
- `POST /api/direct-sales/session/{id}/cancel`

## Operator UX
- Product search 150ms debounce, keyboard dropdown, catalog number
- F1/F2/F3 payment, Ctrl+Enter complete
- Stock badges: Dostępny / Niski stan / Brak
- FV flow: NIP lookup via customer search + compact invoice form
- Polish status labels throughout
