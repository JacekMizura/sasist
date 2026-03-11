# Warehouse special nodes (START, PACK, DOCK)

Special nodes define the start of picking, the packing station, and optional shipping docks. They are used in **route simulation** and **warehouse layout** design.

## Node types

| Type        | Purpose                    | Usage in route simulation   |
|------------|----------------------------|-----------------------------|
| **PICK_START** | Picking start point        | Start of the picker route   |
| **PACKING**    | Packing station            | End of the picker route     |
| **DOCK**       | Shipping dock (optional)   | Reserved for future use     |

## Warehouse Designer

In the **Projektant Magazynu** (Warehouse Designer) toolbar you will find:

- **Add Start Point** – place the picking start (green circle, label **START**). Only one per warehouse; placing a new one replaces the previous.
- **Add Packing Station** – place the packing station (blue square, label **PACK**).
- **Add Dock** – place a shipping dock (gray diamond, label **DOCK**).

**Interaction:** select a tool, then click on the canvas. The app sends a request to create the special location (POST `/warehouse/special-location` with `warehouse_id`, `x`, `y`, `type`). Coordinates are stored in **centimeters**. Markers are drawn **above shelves** on the map.

## Route simulation

Pick route simulation uses:

1. **START** (PICK_START) – the graph node nearest to this location is the **route start**.
2. **PACK** (PACKING) – the graph node nearest to this location is the **route end**.

The computed path is: **START → pick locations (nearest neighbor) → PACKING**.

- If **PICK_START** is missing, the API returns: *"No picking start location defined"*.
- If **PACKING** is missing, the API returns: *"No packing location defined"*.

Walking speed is **1.4 m/s** for estimated time. See `docs/PICK_ROUTE_SYSTEM.md` for full route logic.

## Validation

- **Only one PICK_START per warehouse.** Creating a new PICK_START removes the previous one (backend enforces this).
- PACKING and DOCK can each exist once per warehouse in the current UI; the backend allows multiple PACKING/DOCK locations if needed later.

## API

- **POST** `/warehouse/special-location`  
  Body: `{ "warehouse_id": int, "x": float, "y": float, "type": "PICK_START" | "PACKING" | "DOCK" }`  
  Creates the special location; for `PICK_START`, any existing one for that warehouse is removed first.

- **GET** `/warehouse/{warehouse_id}/special-locations`  
  Returns: `{ "pick_start": { "id", "x", "y" } | null, "packing": { "id", "x", "y" } | null, "dock": { "id", "x", "y" } | null }`.

Coordinates `x`, `y` are in **centimeters** and are used to find the nearest graph node for routing.
