**Return Activity Log — PASS (2026-08-23).**

- Dziennik = ActivityLog `object_type=return` (reuse Order framework; no second log system)
- New codes: STATUS_CHANGED, ITEM_ADDED, REFUND_COMPLETED, ARCHIVED (+ existing create/decision/intake/receipt/putaway/finalize)
- Mutations wired: create, add-line, panel/workflow status, bulk status, refund, commit-wms finalize, archive
- Return-only links (no Order Logi spam); `[WMS - Zwroty]` presentation; actors from `get_current_user`
- Forward-only; backfill plan in `memory/return-activity-log.md` (not run)
