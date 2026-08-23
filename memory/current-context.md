**Order › Logi + WMS projection — PASS (2026-08-23).**

- `wms_order_events` SSOT; Activity Log = order-facing business timeline
- Dual-write hardened: category `wms`, correlation `wms-evt:{id}`, technical scan spam skipped
- NEW: Smart/3D matching, PACK_ALL, shipment request, waybill, packaging RW doc
- Forward-only; backfill plan documented (not run)
- WMS workflow logic unchanged
