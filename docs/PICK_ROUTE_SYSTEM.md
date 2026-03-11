# Pick route system: start location and packing station

This document describes how the warehouse pick route simulation uses **start** and **packing** locations to compute realistic walking distances and estimated picking times.

## Overview

- **Start location (PICK_START)** – Where the picker begins the route. Exactly one per warehouse.
- **Packing station (PACKING)** – Where the picker ends the route (packing station). One per warehouse for simulation.
- The simulated route is: **START → pick locations (nearest neighbor) → PACKING**.

Both are stored as special `Location` rows with `location_type` in `PICK_START` or `PACKING`. Coordinates (`x`, `y`) are in **centimeters** and are used to find the nearest graph node for routing.

## Data model

- **Location.location_type**: `NORMAL` | `PICK_START` | `PACKING` | `DOCK`
  - `NORMAL` – standard storage location (default for existing rows).
  - `PICK_START` – start of picking route (at most one per warehouse).
  - `PACKING` – packing station (end of route).
  - `DOCK` – optional shipping dock (reserved for future use).

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
3. **Start/end nodes**: The graph node nearest to the PICK_START `(x, y)` is the route start; the node nearest to the PACKING `(x, y)` is the route end. Coordinates are in cm (same as `Location` and warehouse graph nodes).
4. **Nearest-neighbor route**:  
   **START node → pick nodes (order from inventory, nearest neighbor) → PACKING node.**
5. **Metrics**:
   - **Total distance** – Sum of Dijkstra segment distances along the path (meters).
   - **Estimated time** – `total_distance / 1.4` seconds (walking speed **1.4 m/s**).

## Response shape (pick route)

- **GET** `/analysis/pick-route/{order_id}` (and batch) returns:
  - `route`: `[{ "node_id", "x", "y" }, ...]` – full path from START to PACKING through picks.
  - `start`: `{ "x", "y" }` – PICK_START coordinates.
  - `end`: `{ "x", "y" }` – PACKING coordinates.
  - `pick_locations`: list of picked locations.
  - `total_distance`: meters.
  - `estimated_time`: seconds.
  - `error`: set if e.g. PICK_START or PACKING is missing.

## Frontend

- **Warehouse designer**: Toolbar tools *Punkt startowy (START)* and *Stacja pakowania (PACK)*. User selects tool, clicks on the map; a special location is created via POST `/warehouse/special-location`. START is drawn as a green circle, PACK as a blue square (above shelves).
- **Simulation page (Symulacja trasy)**: Before running simulation, the app checks that the warehouse has both PICK_START and PACKING (GET special-locations). If either is missing, it shows: *"Define start and packing locations in the warehouse designer."* The map draws the graph in blue, the picking route in red, with START (green) and PACK (blue) markers and displays total distance, estimated picking time, and number of picks.

## Validation summary

- When the user runs (single or batch) pick route simulation, the warehouse **must** have:
  - A **PICK_START** location.
  - A **PACKING** location.
- If either is missing, the backend returns an error and the frontend shows the message above and disables batch simulation until both are defined in the warehouse designer.
