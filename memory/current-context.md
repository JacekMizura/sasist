# current-context

## Active

**FAZA STABILIZACJI WMS** — bez nowych funkcji.
Cel: produkcyjny, spójny flow (CartLifecycle + Capacity + Event/Activity Log + CartStatus).

## Naprawione w audycie (2026-07-18)

- Duplikat indeksu `ix_activity_events_category` → crash `create_all`
- `ensure_activity_log_tables` zawsze reconciliuje indeksy (`IF NOT EXISTS`)
- PG allowlist: `ensure_carts_picking_lifecycle_columns` + lifecycle history/events
- **Event Log:** legacy `event_type NOT NULL` → DROP po backfill do `event_code` (NotNullViolation 500)
- **Schema health:** WMS audit/sessions/picks/orders timeline na PG allowlist; carts capacity healed; report `memory/schema-health-check.md`
- **Wózki:** SSOT `list_orders_on_cart`; sekcja Przypisane zamówienia; Activity Log z numerami; jedna Pojemność
- **Wózki close-out:** pełny audyt spójności A–E (`memory/carts-consistency-audit.md`); regresje volume/clear/finish_packing/Activity refresh naprawione
- **Wózki UX:** odłączenie 1 zamówienia (lifecycle), tooltips numer/pozycje, Activity Log expand + inline numery
- **Capacity Analytics:** osobny raport silnika (agregaty + lazy szczegóły); Activity Log bez skipów; admin „Analiza Capacity”
- **SSOT Panel↔WMS:** product-lines / licznik / pick / shortage / finalize / bundle → `list_orders_on_cart` gdy `cart_id` (`resolve_wms_picking_order_ids`); hub bez wózka = kohorta
- **Activity Log:** When/Who/What; `#` tylko przy assign/detach (`show_order_numbers`); Capacity = zwinięta historia ostatniego doboru
- **Wózki szczegóły UX:** KPI Podsumowanie → tabela zamówień → Historia doboru → ActivityLogTable (`memory/cart-details-ux-redesign.md`)
- **HTTP 500 diagnostics:** kanoniczny log `exception_type/message/file/function/line/traceback` pod `request_id`; handler `ResponseValidationError`; `from e` zamiast `from None` na WMS 500; `exception_origin` preferuje ramkę `backend/` (nie site-packages). Audit: `memory/wms-http-500-diagnostics-audit.md`
- **product-lines/detail 500 — root cause (PG repro):** `ValidationError` w `build_wms_picking_product_detail` **L1867** (`WmsPickingBundleComponentStatus`, `bundle_component_index=0` z `bundle_operational_ux_service.py` L137 `or 0`). Fix biznesowy **jeszcze nie wdrożony** (tylko diagnostyka + wskazanie linii).

## Open (stabilizacja)

- Heartbeat / claim FE nieużywane
- READY/PACKING brak ścieżki admin abort (dead-end poza finish packing)
- Optimizer MULTI vs Capacity Engine
- GET product-lines mutuje lifecycle
- Minimalny fix `bundle_component_index` (detail 500) — czeka na decyzję po wskazaniu linii
