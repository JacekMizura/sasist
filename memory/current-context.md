**ORDER_CREATED Activity Log — PASS (2026-08-23).**

- Root cause: ERP `POST /orders` (`create_order`) never emitted Activity; create is distributed (no central factory)
- Wired: MANUAL/COPY via `create_order`, IMPORT via `ORDER_IMPORTED` (shared `order-created:{id}`), DIRECT_SALE via `create_order_from_session`
- Policy A: initial `Nowe` does not emit fake null→Nowe status event
- Actor: `get_optional_current_user` → USER when Bearer present
- WMS touched=0
