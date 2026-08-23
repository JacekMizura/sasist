**Order › Logi Phase 2 — PASS (2026-08-23).**

Forward-only Activity Log coverage for commerce/custom fields (no new timeline, WMS=0).

Implemented:
- ORDER_CUSTOM_FIELD_CHANGED / FILE_ATTACHED / FILE_REMOVED
- ORDER_PAYMENT_REGISTERED / STATUS_CHANGED (+ panel method/status)
- ORDER_PAYMENT_METHOD_CHANGED / ORDER_SHIPPING_METHOD_CHANGED
- ORDER_IMPORTED (CSV import created_new; actor INTEGRATION)

Skipped (no non-WMS canonical pipeline):
- ORDER_REFUND_RECORDED, shipment/tracking lifecycle, Wfirma/doc integration send

Writers: `order_commerce_activity.py`; hooks in order.py, payment_service, import_service, files sync.
