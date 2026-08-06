## Active

**Product Management ecosystem (plan accepted 2026-08-06) — DONE through Etap 7.**

- Plan: `memory/plan-product-management-ecosystem.md`
- Etap 0–1, 3–7 shipped (nav, categories polish, family UX, generator allocate, list group-by, identity header, PIM UX tokens)
- Shared UI tokens: `frontend/src/pages/Assortment/pimUi.ts`
- Product Family (ADR) remains SSOT for catalog grouping; Variant stack removed

**Logi z WMS na karcie produktu (2026-08-05).**

- Zakładka „Logi z WMS” (`warehouseOps`) — `ProductWarehouseMovementsPanel` + `GET /products/{id}/movements`

**Pola dodatkowe produktów (2026-08-05).**

- Asortyment → Pola dodatkowe; wartości na karcie w Podstawowych

**SKU / numer katalogowy z kategorii (2026-08-05 + 2026-08-06).**

- `product_codes` + Generuj w bloku Tożsamość; kreator rodzin alokuje przy create

**Warianty produktów — REPLACED by Product Family (2026-08-06).**

- Legacy Variant stack removed; use Asortyment → Rodziny
