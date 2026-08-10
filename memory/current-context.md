## Active

**Aktywny wózek SSOT (2026-08-10) — definitywna naprawa 409 BASKETS:**
- Root cause: skaner statusów fallbackował na `needsScanTiles[0]` (często BASKETS) przy sesji CART; CTA gdy `active_cart_type !== cart_type` kafelka; `session_source_status_id` nie było w schemacie Pydantic
- FE: `WmsPickingStatusPage` — skan TYLKO przy jawnym `scanTargetStatusId` bez aktywnej sesji; zero fallbacku typu; CTA wyłącznie gdy `!rowHasOperatorActiveSession`
- BE: `resolve_operator_active_picking_session` + `GET /picking/active-session`; configured-statuses wiąże sesję WYŁĄCZNIE do `meta.source_status_id`; obce kafle bez wózka/CTA mylącego
- Schema: `has_operator_active_session`, `session_source_status_id`
- resolve-cart: 409 gdy wózek już ASSIGNED/PICKING u operatora (nie start nowej sesji)
- Mixed cart_scan+baskets → BULK; „Wszystkie” w order-type tylko przy tym samym typie wózka

**Spójność sesji zbierania (2026-08-10):**
- Bug: `pickingSessionId` na sesji WÓZKOWEJ mylony z cartless → czyścił cartId, product-lines 409, cancel-cartless 400
- Fix: `isCartlessPickingSession` — cart_id wygrywa; merge nie wymusza cartless
- BE product-lines: session z cart_id → ścieżka wózkowa + source_status z meta
- cancel-cartless z cart_id → `cancel_picking`; tile mixed scanned+baskets → BULK (nie BASKETS)
- Projekcja: sesja tylko na swoim `source_status_id`; API `session_source_status_id`
- Skan CART-* na liście produktów przy aktywnej sesji → consumed, bez resolve-cart

**Wznowienie sesji zbierania (2026-08-10):**
- Jedna sesja = jeden wózek; skan tylko przy ROZPOCZĘCIU nowej sesji
- BE: `bootstrap_start_picking_if_needed` — walidacja typu wózka NIE przy PICKING/ASSIGNED+sesja
- FE: aktywna sesja → klik statusu → od razu produkty

**Sesja zbierania — SSOT wózek + produkty (2026-08-10):**
- Projekcja: `wms_picking_session_projection.py` (ten sam `build_wms_picking_product_lines` co lista)
- Statusy: `session_products_*` + `active_session_id` + `active_order_type`
- Hub „Wybierz”: produkty z sesji gdy aktywna; `order_count` nadal = wolne

**Przypisywanie wózków w zbieraniu — SSOT (2026-08-10):**
- Typ wózka vs kafelek: BULK↔`CartType.BULK`, BASKETS↔`MULTI`; reject PL msg
- Badge / skan na statusach; skip re-scan gdy pasujący wózek; lista zamówień filtr `source_status_id` na wózku
- `in_progress_by_me` filtruje typ wózka per status config (ASSIGNED|PICKING)

**Ekran Wybierz — układ + AKTYWNE (2026-08-10):**
- Kafelki single/multi/all w rzędzie (flex wrap: 3 / 2+1 / 1)
- Tekst: `Produkty do zebrania: X/Y szt.`
- Badge AKTYWNE z `active_order_type` hubu (otwarta sesja / inferencja zamówień)
- `order_type` zapisywane w metadata przy `start_picking` (bez zmiany assign)

**Status zbierania — badge wózka (2026-08-10):**
- Na kafelkach z `require_cart` (scanned/baskets): chip `Wózek: …` gdy operator ma ASSIGNED/PICKING
- SSOT: `Cart.assigned_user_id` via `configured-statuses` (`active_cart_*`); fallback `WmsPickingCartContext`
- Bez nowego mechanizmu przypisywania

**Picking UI rebuild — Sellasist-clean (2026-08-10):**
- White minimal list/detail; Sasist `PackingLocationPill` for locations; sticky „Zebrane” + ⋮ options sheet
- Kit: `components/wms/picking/Picking*` (header, card, sticky, primitives)
- Logic unchanged (scan/finalize/shortage/MULTI); typography via `wmsTypoClass`

**WMS Ogólne / typografia (2026-07-24):**
- Tab Ustawienia WMS → „Ogólne”: 5 poziomów 12|14|16|18|20 px (domyślna 16)
- SSOT: `wms_general_settings` + GET/POST `/wms/settings/general`
- FE: CSS vars on `WmsOperationalLayout` via `WmsOperatorTypographyProvider`; consume `wmsTypoClass`
- No auto-downscale on collectors — layout wraps instead
- Stare wartości (np. 21) normalizują się do 16 przy odczycie

**Picking terminal settings (2026-08-10):**
- DB/API: `WmsPickingTerminalSettings` → `/wms/settings/picking-terminal`
- FE policy: `pickingTerminalScanPolicy.ts` (`computeNeedsLocationScan`)
- Operator detail: gates + `product_scan_confirmed`; reserve filtered in product detail / pick paths

**Picking configurator status pickers (2026-08-09):**
- Modal uses shared `OrderUiStatusField` with raised portal z-index
- Allowed statuses from WMS panel groups + packing start IDs (not hardcoded names)
- Save blocked when source/target missing or outside allow-list

**Packing automation activators wired (2026-08-09):**
- Shared runner `orderAutomationRun.ts` → `change_status` via `PATCH …/ui-status`; other effect kinds fail with PL errors (no mocks)
- `PackingAutomationActivators`: labels/icons from rule, loader + exclusive run gate, errors via `showScannerError`
- Help copy no longer says activators don’t affect packing; visibility from enabled WMS packing rules only

**Packing list vs source status (2026-08-09):**
- Queue SSOT: only selected packing `status_id` (no name heuristic); eligibility requires `order_ui_status_id`
- FE counters exclusive from same API list; green translucent overlay on fully packed product cards

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
