# Warehouse special nodes (START, PACK, DOCK)

Special nodes define the start of picking, the packing station, and optional shipping docks.
They appear on the **warehouse map** and feed geometry consumers (slotting distance, designer).

## Domain split

| Concern | Table | Responsibility |
|---------|-------|----------------|
| **Map marker** | `warehouse_special_placements` | Role + `x_cm` / `y_cm` on the floor plan |
| **Operational identity** | `locations` | Documents, inventory, ATP, receiving (`location_type`) |

Deleting a marker removes the **placement** only. It never deletes `locations` and cannot break `stock_documents` history.

UNIQUE `(warehouse_id, role)` — one active map marker per role per warehouse.

## Node types

| Type | Purpose | Usage |
|------|---------|--------|
| **PICK_START** | Picking start point | Map + geometry for start |
| **PACKING** | Packing station | Map + distance-to-packing |
| **DOCK** | Shipping / inbound dock marker | Map; linked Location may hold DOCK stock |

## Warehouse Designer

Toolbar: Add Start / Packing / Dock → click canvas → `POST /warehouse/special-location`.

- Move → `PUT`/`PATCH /warehouse/special-location/{placement_id}` (coords only)
- Delete → `DELETE /warehouse/special-location/{placement_id}` (placement only)

Coordinates are stored in **centimeters** on the placement row.

## Route simulation

Pick-path **Runtime Graph** still uses operational routing nodes (`picking_start`, `packing`).  
Map/slotting geometry for START/PACK/DOCK is read from **`warehouse_special_placements`** via `get_special_locations_xy` / `get_special_placements_xy` — **not** from `locations.x/y`.

## API

- **POST** `/warehouse/special-location`  
  Body: `{ "warehouse_id", "x", "y", "type": "PICK_START"|"PACKING"|"DOCK", "rotation"? }`  
  Upserts placement; ensures/links operational `locations` row (`location_id`).

- **GET** `/warehouse/{warehouse_id}/special-locations`  
  `{ "pick_start"|"packing"|"dock": { "id", "x", "y", "location_id" } | null }`  
  `id` = **placement** id.

- **PUT/PATCH** `/warehouse/special-location/{placement_id}` — coords only.

- **DELETE** `/warehouse/special-location/{placement_id}` — placement only.
