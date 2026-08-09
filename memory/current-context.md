## Active

**Packing finish #1249 (2026-08-09):**
- Partial pick without shortage → recovery_work blocks finish (validation kept)
- SSOT: no fake physical-complete while recovery open; pick-capped required_pack_qty; clear PL message

**Packing carton gate UI (2026-08-09):**
- `PackingCartonGateModal`: white compact header + 5-col grid, JsBarcode from carton EAN/SKU/id, scan=select
- API: `WmsPackingRecommendedCarton.barcode` / `ean`; `ScannerHandler` no longer clears handler when disabled (carton gate can own scan)

**Bundle STOCK production order 500 (2026-08-09):**
- Cause: `production_orders.recipe_id` NOT NULL vs composition-only MO (`recipe_id=NULL`)
- Fix: schema ensure + migration; path remains `composition_id` from bundle manufacturing BOM

**Packing finish 404 no_cart (2026-08-09):**
- Finish loader: active queue OR fully-packed + mode-compatible fallback (Polish business messages)
- FE: keep `mode=all` when opening cartless card from all list; finish errors via red scan feedback overlay
- Regression: `backend/tests/test_packing_finish_no_cart.py`

**AutoActions screen rebuild (2026-08-09):**
- `AutoActionsView` + `PackingFinalizationView` share `AutoActionsShell` (mockup 1:1, white bg)
- Steps filtered by API `auto_actions`; COD block only when payment is COD
- States from `post_pack_pipeline` / finish progress; after-effect via `afterActionsBehavior` (scan / list / next — navigation still in controller)

**Packing view settings: location + activators (2026-08-09):**
- `locationBadgePosition`: only `top_right` | `in_details` („Prawy górny róg” / „W szczegółach produktu”); legacy corners → `top_right`
- Wired into Default/Active/Done cards + `LineDetailsBlock` via `location_placement` in field visibility
- Settings previews reuse real packing product cards; activators preview top strip / bottom pinned bar
- Removed `CAP_NONE` / „BRAK FUNKCJONALNOŚCI” from both selects; info tooltips via `PACKING_SETTING_HELP`

**Packing automation activator position (2026-08-09):**
- Setting `automationButtonsPosition`: only `top` | `bottom` („Na górze” / „Na dole”)
- Removed `floating` / `right` from UI + types; legacy → `bottom` via `normalizePackingAutomationButtonsPosition`
- Placement in product column only (not sidebar): top = strip above list/grid; bottom = pinned footer under scroll area

**Shipping method logos NS_BINDING_ABORTED (2026-08-09):**
- Root cause (page lifecycle, not broken files): DEV `React.StrictMode` remounted list logos after first paint → browser aborted in-flight `GET /uploads/...`; abort `onError` + module failure cache flipped `src` (more aborts). Double fetch without effect cleanup could `setRows` twice.
- Fix: drop StrictMode remount; cancellable single load by `warehouseId`; `mergeShippingMethodsRows`; mounted-only `onError`; no module fail-cache; memo list row + stable `key={id}`.
- Do not “fix” with more logo fallbacks / Railway / S3.

**Packing finish UUID series bug (2026-08-09):**
- `create_packing_packaging_rw`: `document_series_id=str(series.id)` (UUID), not `int(series.id)`
- Symptom was HTTP 400 on finish with carton selected (RW consume path)

**Packing cart/basket scan as list lookup (2026-08-09):**
- Status → session `mode=all` → orders list (no forced scan screen)
- Global scanner on list: cart → filter orders; basket → open order; empty → toast
- Picking collection config does NOT gate packing cart scan
- Helpers: `resolvePackingHandoffScan` + `applyPackingHandoffScanResult` (no PackingHandoffScanModal)

**Packing reopen already-packed (2026-08-09):**
- Click fully packed order → packing view (all Done, no active line) + `AlreadyPackedOrderModal`
- Accept → `POST …/acknowledge-reopen` → `PACKING_REOPEN_ACKNOWLEDGED` (WmsOrderEvent + activity log)
- X/Escape dismiss without log; back → lista; suppress AutoActions/finalization on reopen
- Detail fallback outside active queue for packed/finalized/status PACKED|SHIPPED|…

**Order panel status change (2026-08-09):**
- Endpoint: `PATCH office/order-ui/orders/{id}/ui-status` → `apply_order_panel_ui_status`
- Status always persists; cart detach only when `can_detach_order_from_cart` allows
- Detail UI: toast on error + `reloadOrderById` after success

**Packing layout settings (2026-08-09):**
- `layoutMode`: `with_sidebar` | `full_width` (legacy unused values → sidebar via schema v2)
- Full-width: no left sidebar; `PackingOrderFullWidthInfo` strip; denser product grid; Spakuj wszystko in header
- `movePackedToBottom` wired in `sortLinesForPacking` / `sortedLines`
- Order chrome toggles: `showOrderPhone`, `showOrderValue`, `showShippingAddress` (default ON)
- View settings: collapsible `Podgląd układu` under layout / products / comments / sales doc (default collapsed)

**Packing product appearance (2026-08-09):**
- Shared `packingProductDisplay.ts` merges `interface_display` + extended UI
- Cards (Active/Default/Done) honor stock/EAN/SKU/catalog/signature/price/name/truncate/image/location
- API: `product_signature`, `unit_price_display` on packing lines
- Mockup layout: fixed grid 20×19.5rem; list full-width rows; EAN badge; done = translucent green whole-card + faded image/data
- Settings preview (`ProductDisplayModePreview`): fixed card widths, includes Done sample
