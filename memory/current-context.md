## Active

**Order panel status change (2026-08-09):**
- Endpoint: `PATCH office/order-ui/orders/{id}/ui-status` → `apply_order_panel_ui_status`
- Status always persists; cart detach only when `can_detach_order_from_cart` allows
- Detail UI: toast on error + `reloadOrderById` after success

**Packing layout settings (2026-08-09):**
- `layoutMode`: `with_sidebar` | `full_width` (legacy unused values → sidebar via schema v2)
- Full-width: no left sidebar; `PackingOrderFullWidthInfo` strip; denser product grid; Spakuj wszystko in header
- `movePackedToBottom` wired in `sortLinesForPacking` / `sortedLines`
- Order chrome toggles: `showOrderPhone`, `showOrderValue`, `showShippingAddress` (default ON)

**Packing product appearance (2026-08-09):**
- Shared `packingProductDisplay.ts` merges `interface_display` + extended UI
- Cards (Active/Default/Done) honor stock/EAN/SKU/catalog/signature/price/name/truncate/image/location
- API: `product_signature`, `unit_price_display` on packing lines
