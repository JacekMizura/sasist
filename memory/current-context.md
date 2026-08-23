**Cartless session membership + one-scan pick — PASS (2026-08-23).**

## Root causes
1. **#1276 split-brain:** cartless membership = `Order.picking_session_id` snapshot; panel Pilne→Nowe updated UI status only (cart path had detach; cartless had none). Product list via `picking_session_id` ignored `source_status_id`.
2. **Double EAN:** location accept called `openQtyStep` → PRODUCT_SCAN_REQUIRED; product scan set satisfied then `openQtyStep` with stale closure still requiring product scan; cartless opened qty panel instead of `confirm_pick(1)`.
3. **`2 szt.` vs `0/6`:** hub `products_total` = SKU lines; label said „szt.”

## Fix
- `membership_service`: release on status leave without picks; block with picks; revalidate at resolve/start
- Detail: location accept waits for product; product EAN → `confirm_pick(1)`
- Hub: `units_*` from demand SSOT; UI „Produkty · Sztuki”

## Tests
`test_wms_cartless_session_membership.py` + prior cartless regressions
