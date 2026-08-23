**WMS picking stock consistency + finalize audit — PASS (2026-08-23).**

- Root cause: cartless `record_cartless_quick_pick` wrote draft Picks without `effective_pickable` gate → UI 1/1 while Inventory 0 at finalize
- Fix: pick-time gate (physical − pending − foreign res) + structured 409 + `WMS_PICKING_FINALIZE_FAILED` Activity + cartless cart_id emit fix
- Tests: `test_wms_cartless_picking_stock_finalize.py`
