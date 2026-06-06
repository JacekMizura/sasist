# Current context

## Active goal
Direct sales `POST /api/direct-sales/session/{id}/complete` — reliable end-to-end (order, stock, payment, PA/FV document, session close).

## Direct sales complete fix (2026-06-06)
- Failing stage: **`reserve_stock`** — movement row not flushed before `int(mov.id)`; schema columns for session reservations sometimes missing until tier1 background migration.
- Structured logs: `[direct_sales.complete] {session_id, stage, status, error}` in pipeline + API handler.

## Pricing + inventory (2026-06-04)
- `ResolvedProductPricing` + `resolveProductPricingFromRow` / `resolveDirectSalesUnitPricing` in `utils/resolvedProductPricing.ts`.
- Product list, edit header, direct sales terminal use unified resolver (sale net → gross via VAT).
- List + detail pass `warehouse_id` from `WarehouseContext`; list passes `listStockHint` for cross-view mismatch detection.
- Backend list uses `apply_inventory_display_to_dict` (same as detail); `[product.inventory.compare]` structured logging.

## Prior: Location labels
Warehouse location label consistency — single resolver everywhere; backend `sync_location_display_fields` on rename/save.

## Location labels (final pass)
- UI rule: all displayed labels via `resolveWarehouseLocation` / `resolvedLocationLabel` / `buildUuidToResolvedLocation`.
- `syncLayoutDisplayFields` on load + before save; `loadLayout` refetch after PUT clears stale inventory.
- Migrated: ElevationPanel, SlottingPage, damageShared, reports/PDF export, LocationMappingExportImport, MagazynProductsSidebar (no `inv.location_name` fallback).
- Backend: `sync_location_display_fields` updates `Location.name` + `putaway_last_location_name`; inventory/reservations/pick routes read `Location.name` live.

## Prior: Direct Sales
Direct Sales terminal — settings source of truth + complete-sale reliability.

## Recent fix (Direct Sales)
### Settings ignored
- **`resolvedDirectSalesSettings`** — `ResolvedDirectSalesSettingsProvider` + `useResolvedDirectSalesSettings()`; terminal waits for API load before render.
- All terminal UI reads from context (line cards, search, payment, customer, document, location picker).
- Backend enrichment: `product_catalog_number`, `margin_percent` on session lines.
- Price display: `formatDirectSalesPrice` (gross/net/both) on lines, search, payment total.
- `prefer_store_locations` wired: product search preferred loc, issue plan, location picker sort.

### Complete sale 500
- Structured `[direct_sales.complete]` JSON logging per pipeline stage (`complete_pipeline_log.py`, `complete_service.py`).
- `order_service`: validate `order_ui_status_id` exists before FK assign (fallback to default "Nowe").

## Prior
- TDZ fix: `issueStrategy` before use in `useDirectSalesSession`.
- Product inventory display shared service + logging.
