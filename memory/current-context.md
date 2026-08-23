# Current context

- Phase 1 warehouse series standardization shipped: capabilities SSOT, warehouse-only form, backend validation, numbering preview API.
- BUSINESS RESERVATION SSOT: `order_warehouse_reservations`; RZ subtype RESERVATION, physical_effect=false.
- Supported warehouse subtypes: WZ, PZ, Z_PZ, RW, PW, MM, RESERVATION. Legacy ZW/ZD moved to optional seed only.
- Physical decrement unchanged: classic WMS = pick finalize; direct sale = WZ issue; RZ = none.
