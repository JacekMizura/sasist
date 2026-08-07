## Active

**Order Multiakcje (2026-08-07) — done.**

- Shared `frontend/src/components/multiActions/` shell
- Order list: Zap „Multiakcje” → `OrderMultiActionsModal` (same UX as products)
- Live modules: status, payment, note, shipping, document, custom_field
- Host: packing_queue, export, delete
- Stubs (no BE yet): operator, tags, fulfillment_warehouse, order_source
- Dropdown multiakcji usunięty

**WMS settings UI unification (2026-08-07).**

- Shared `WmsSettingsTabFrame` + collapsible icon sections + icon left nav
- All process tabs aligned to Pakowanie pattern (layout only)
