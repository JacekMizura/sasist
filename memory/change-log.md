# Change log

## 2026-06-04 — Direct sales settings cache + sale documents

- Terminal: localStorage cache-first settings (`directSalesSettingsCache`), instant render, silent API refresh via `settings_version`.
- Document complete: auto-seed SALE series (PA/FV), `[direct_sales.document]` logging, `GET /sale-documents/` list wired to Dokumenty sprzedaży.

## 2026-06-04 — Unified pricing + inventory parity

- `resolvedProductPricing.ts`: canonical `ResolvedProductPricing` DTO; list/detail/direct sales consume only resolver.
- Direct sales: `unit_price` treated as sale net (was incorrectly shown as gross); line totals use `sale_gross`.
- Product list/detail: `warehouse_id` from `WarehouseContext`; cross-view mismatch message instead of hiding divergence.
- Backend: list endpoint uses `apply_inventory_display_to_dict`; `[product.inventory.compare]` logging on list + detail.

## 2026-06-04 — Location label final consistency pass

- Frontend audit: replaced remaining `getDisplayLocationLabel` / `bin.label` / `inv.location_name` display paths with `resolveWarehouseLocation` helpers.
- Files: ElevationPanel, SlottingPage, damageShared, buildWarehouseStructureReportData, productLocationReportDataBuilder, LocationMappingExportImport, MagazynProductsSidebar.
- `getAllPositionsFromRacks`: store-rack storage type matches resolver (pick/green).
- Backend doc: `sync_location_display_fields` documents Location.name as source for inventory, reservations, pick routes.

## 2026-06-04 — Direct Sales settings + complete pipeline

- Frontend: `resolvedDirectSalesSettings` context; terminal blocks until settings API resolves; all UI components use `useResolvedDirectSalesSettings()`.
- Price/catalog/margin display on line cards and search; `price_display` mode on totals.
- Backend: session line enrichment (`product_catalog_number`, `margin_percent`); `prefer_store_locations` in search + issue plan.
- Complete sale: `[direct_sales.complete]` structured JSON logging per stage; order `order_ui_status_id` FK validation before assign.

## 2026-06-04 — Layout designer label/type sync

- `resolvedWarehouseLocation.ts`: single resolver for label + storageType (store racks → green/pick).
- Template regen: `mergeRegeneratedBins` preserves UUIDs; `syncRackBinsDisplayFields` aligns label/location_id.
- Save layout refetches via `loadLayout` after PUT.
- Inspector: close clears selection; click reopens panel (`previewRackId` + `rackPanelDismissed`).
- UI uses resolver in RackSideViewGrid, Magazyn sidebar, InternalLayout, RackPropertiesSidebar.

## 2026-06-04 — Direct sales TDZ fix (`issueStrategy`)

- **Root cause:** `hooks/directSales/useDirectSalesSession.ts` — `ensureSession` / `startNewSession` referenced `issueStrategy` before `useMemo` declaration (temporal dead zone at render).
- **Route:** `/wms/direct-sales` — confirmed via Playwright on production build with sourcemaps.
- **Fix:** declare `issueStrategy` immediately after `total` useMemo, before callbacks.

## 2026-06-04 — Production TDZ debug build + import hardening

- `types/productListRow.ts`: API layer no longer imports from `pages/Products/productListMapper`.
- `hooks/directSales/useLocationStock.ts`: moved out of pages; imports `api/locationStockApi` directly.
- DirectSales UI: `DirectSalesTerminalState` / `DirectSalesCustomerState` / `DirectSalesProductSearchState` exported from hooks.
- `App.tsx`: `RoutePathLogger` logs `[route.render] pathname`.
- `main.tsx`: `window.onerror` includes `href`, `pathname`, `stack`.
- Vite: `build.minify: false` + `sourcemap: true` for production stack traces.
- madge/dpdm: 0 cycles from `src/main.tsx`.

## 2026-06-04 — Inventory semantics + pricing panel restore

- `stock_quantity` never derived from sum(locations); added `location_allocated_quantity`, `unallocated_quantity`, `reserved_quantity`, `available_quantity`.
- `locations_load_incomplete` only on API load failure (not when unallocated > 0 is valid).
- Pricing: `purchase_gross` in `current_cost`; frontend `resolveProductPricingDisplay` with VAT fallback + brutto/margin labels.
- Magazyn tab: Stan całkowity / Na lokalizacjach / Nieprzypisane breakdown.

## 2026-06-04 — Frontend TDZ crash fix (circular imports)

- Extracted `IssueDetailSection` → `WmsOrderIssueDetailSection.tsx` (broke Page ↔ Content cycle).
- Operational API types → `types/operationalApiTypes.ts` (broke normalize ↔ api cycles).
- Vite `build.sourcemap: true` for readable production stack traces.
- Madge: 0 circular dependencies (was 4).

## 2026-06-04 — Product list/detail inventory parity

- `product_inventory_display_service.py`: single source for stock + locations (list + detail).
- `GET /products` and `GET /products/{id}` share `inventory_display_maps_for_products`; optional `warehouse_id`.
- Logs `[product.list.stock]` / `[product.detail.stock]`; locations payload adds `id` + `code`.
- `locations_load_incomplete` flag when stock > 0 but no rows; frontend warning instead of „Brak stanu magazynowego”.

## 2026-06-04 — Layout designer interaction refactor

- Split rack state: `selectedRackId`, `previewRackId`, `editingRackId`, `draggingRackId` (uuid via `rackPrimaryId`).
- Drag vs click: 5px threshold; double-click opens drawer; single click selects only.
- Properties panel always fixed right drawer (420px); ESC/backdrop/unsaved warning.
- Floating toolbar hidden while dragging or editing name.
- Save: `[layout.save.*]` logs, skip full reload after PUT; explicit `rack_type` in sidebar + payload.

## 2026-06-04 — Direct sales terminal + complete-sale hardening

- Terminal reads resolved settings (`useDirectSalesResolvedSettings`): EAN/SKU/catalog, stock/images, payments, customer/FV rules, allocation strategy.
- Fixed stock hint always 0 (`session_enrichment` → `summary.available`).
- Complete pipeline: structured errors with `step`, validation log, soft-fail completion read; `allow_oversell` in issue plan.
- Payment: cash change UI; MIXED split (cash + card) via `payment_splits`.
- Error modal shows backend step + message (no generic 500).

## 2026-06-04 — Layout editor state corruption fix

- `reindexGeometricRow` no longer overwrites rack names or regenerates bins (root cause of cross-rack mutation).
- Stable rack identity: `rackEntityKey`, `getNextRackIndex`, integrity validation before save.
- `rack_type` persisted explicitly (`store`/`warehouse`) through save payload + hydrate logs.

## 2026-06-04 — Rack editor sidebar UX + save flow

- Rack name persists via layout state + PUT payload; `[rack.rename]` logging (local + persisted on save).
- Properties panel: overlay drawer (does not cover Zapisz układ), close/toggle/ESC/backdrop, resizable + compact mode.
- Internal layout modal: breadcrumb navigation, back, ESC; elevation panel top offset.

## 2026-06-04 — Direct sales status settings unified with order panel

- Replaced hardcoded status strings with `order_ui_statuses.id` fields.
- Shared `order_status_select_service` for `/order-statuses` (active only, subgroup labels).
- Settings UI: dynamic grouped dropdown + optional workflow status fields.

## 2026-06-04 — Product detail API 500 fix

- `GET /products/{id}` routed through `product_detail_service` with per-stage try/catch and degraded minimal payload.
- Logging: `[product.detail]` (stage success) and `[product.detail.error]` (product_id, tenant_id, stage, exception).
- `ensure_products_detail_read_schema()` + `ensure_products_sku_barcode_columns()` for sync schema before detail read.
- Null-safe supplier/manufacturer enrichment; frontend edit page catches mapper failures.

## 2026-06-04 — Direct Sales API contract drift fix

- Canonical request schemas: `backend/api/contracts/direct_sales/` + `frontend/src/modules/directSales/contracts/`.
- Mappers for add-product and set-customer; no inline mutation payloads in hooks.
- Unified `[direct-sales.validation]` logging on 422 (endpoint, body, errors, missing fields, schema name).
- `POST /clear-customer` for anonymous sales; set-customer requires `customer_id >= 1`.
- Dev/staging network debug panel in `OperationalStatusPanel`.

## 2026-06-04 — Phase 3.6 Completion + Traceability

- Confirmation screen after complete with order/doc/payment/operator/stock traceability.
- Backend: `completion_read_service`, `/history`, `/session/{id}/completion`, `/documents/{id}/reprint`.
- OMS: direct sales + immediate fulfillment filters and list badges.

## 2026-06-04 — Phase 3.5 Direct Sales Terminal UX

- Rebuilt `/wms/direct-sales` as operational terminal (left/center/right/bottom layout).
- Split into `components/directSales/` and `hooks/directSales/`; page stays minimal.
- Suspended sessions panel with list/resume/cancel API.
- Keyboard-first: F1/F2/F3 payment, arrows+enter search, stock badges, Polish copy.

## 2026-06-04 — Operational features debug + enablement

- Backend: `operational_feature_resolver.py` with `[feature.resolve]` structured logs; `GET /operational/features/debug` (DEV/STAGING).
- Frontend: `OperationalStatusPanel`, `useOperationalStatus`, differentiated `DirectSalesUnavailable` messages.
- Fix: clear direct-sales endpoint blocks when features API returns `direct_sales: true` (root cause of false "wyłączona" message).
- Docs: incremental rollout env block in `docs/RAILWAY_BACKEND.md`.
