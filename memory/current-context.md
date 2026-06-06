# Current context

## Active goal
Stable production bundle — no TDZ / circular-import crashes.

## Recent fix (frontend crash)
- Root cause: `WmsOrderIssueDetailPage` ↔ `WmsOrderIssueDetailContent` mutual import (`IssueDetailSection` accessed before init).
- Also fixed: `normalizeOperationalApi` ↔ operational API modules (types moved to `types/operationalApiTypes.ts`).
- Source maps enabled on production build.

## Prior
Product list vs detail inventory parity — shared stock/location source of truth.

## Fix (product location bug)
- Shared service: `backend/services/product_inventory_display_service.py`
  - `inventory_display_maps_for_products` — batch stock + locations
  - `get_product_inventory_display_snapshot` / alias `get_product_inventory_snapshot`
  - `apply_inventory_display_to_dict` — used by GET detail
- Both `GET /api/products` and `GET /api/products/{id}` use same helpers; optional `warehouse_id` query param.
- Logs: `[product.list.stock]`, `[product.detail.stock]` with product_id, tenant_id, warehouse_id, total_stock, location_codes.
- Location shape includes `id`, `code`, `name`, `quantity`, `warehouse_id`.
- Flag `locations_load_incomplete` when stock > 0 but no location rows.
- Frontend Magazyn tab: shows „Dane lokalizacji nie zostały załadowane” instead of fake zero when stock > 0 but inventory empty.

## Prior
Layout designer refactor; direct sales terminal fixes.
