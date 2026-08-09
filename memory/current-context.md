## Active

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
