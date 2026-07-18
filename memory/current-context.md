# current-context

## Active

Awaryjne **Zwolnij wózek** (panel OMS): `admin_release_cart` w CartLifecycleService,
`POST /carts/{id}/admin-release/`, UI `AdminReleaseCartButton` w `CartFleetDetailPanel`.
Uprawnienie: `warehouse.carts.admin_release` (lub `warehouse.picking.override`).

Panel Activity Log + Capacity Engine + Cart.status lifecycle — bez zmian reguł.

## Next

- Dual-write OMS order events → `activity_events`
- Filtry UI Activity Log
- Osadzenie Activity Log w kolejnych modułach
