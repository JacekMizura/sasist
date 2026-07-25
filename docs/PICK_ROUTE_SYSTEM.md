# Pick route system: start location and packing station

How pick-route simulation uses **start** and **packing** locations with the **Runtime Graph Reader** (SSOT for distance, hop cost, and visit order).

## Overview

- **Start location (PICK_START)** – Where the picker begins the route. Exactly one per warehouse.
- **Packing station (PACKING)** – Where the picker ends the route. One per warehouse for simulation.
- The simulated route is: **START → pick locations (Runtime Graph visit order) → PACKING**.

Both are stored as special `Location` rows with `location_type` in `PICK_START` or `PACKING`. Coordinates (`x`, `y`) are in **centimeters** and bind locations into the authored routing graph (Location Access / access points).

## Data model

- **Location.location_type**: `NORMAL` | `PICK_START` | `PACKING` | `DOCK`
  - `NORMAL` – standard storage location (default for existing rows).
  - `PICK_START` – start of picking route (at most one per warehouse).
  - `PACKING` – packing station (end of route).
  - `DOCK` – receiving / shipping dock (putaway origin, etc.).

## API

### Create special location

- **POST** `/warehouse/special-location`
- Body: `{ "warehouse_id": int, "x": float, "y": float, "type": "PICK_START" | "PACKING" }`
- If `type === "PICK_START"`, any existing PICK_START for that warehouse is removed before creating the new one.
- Returns the created location: `{ "id", "x", "y", "location_type" }`.

### Get special locations

- **GET** `/warehouse/{warehouse_id}/special-locations`
- Response: `{ "pick_start": { "id", "x", "y" } | null, "packing": { "id", "x", "y" } | null }`.

## Route simulation flow

1. **Load special locations** for the order’s warehouse: PICK_START and PACKING.
2. **Validation**: If there is no PICK_START, the API returns an error: *"No picking start location defined"*. If there is no PACKING, it returns *"No packing location defined"*.
3. **Visit order and distance** — Runtime Graph Reader (`order_location_ids_by_graph`, `chain_distance_m` / hop cost on authored edges). No location-number / Euclidean surrogate for routing.
4. **Metrics**:
   - **Total distance** – Graph chain distance (meters).
   - **Estimated time** – `total_distance / 1.4` seconds (walking speed **1.4 m/s**).

See `docs/architecture/routing_graph_runtime.md`.

## Response shape (pick route)

- **GET** `/analysis/pick-route/{order_id}` (and batch) returns:
  - `route`: path nodes from START to PACKING through picks (when available).
  - `start` / `end` — PICK_START / PACKING coordinates.
  - `pick_locations`, `total_distance`, `estimated_time`.
  - `error`: set if e.g. PICK_START or PACKING is missing, or graph not configured.

## Frontend

- **Warehouse designer**: Toolbar tools *Punkt startowy (START)* and *Stacja pakowania (PACK)*. User selects tool, clicks on the map; a special location is created via POST `/warehouse/special-location`.
- **Simulation page (Symulacja trasy)**: Requires both PICK_START and PACKING; draws the authored graph and the computed route.

## Validation summary

- When the user runs (single or batch) pick route simulation, the warehouse **must** have:
  - A **PICK_START** location.
  - A **PACKING** location.
  - A **ready authored routing graph** (Runtime Graph Reader `graph_ready`).
