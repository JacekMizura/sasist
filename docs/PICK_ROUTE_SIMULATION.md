# Pick Route Simulation

How the shortest walking route for picking an order is calculated and exposed.

---

## Goal

- For a given **order_id**, compute the walking path that:
    1. Starts at the packing station (or warehouse entry / PICK_START).
    2. Visits each pick location where the order’s products are stored.
    3. Uses the **Authored Warehouse Routing Graph** via **Runtime Graph Reader** (SSOT).

- The result is used to:
  - Estimate **total walking distance** (meters).
  - Estimate **picking time** (fixed walking speed).
  - Visualize the route (frontend: Analysis → Symulacja trasy).

---

## Single Source of Truth

**Runtime Graph Reader** (`backend/services/warehouse_routing/runtime_graph_reader.py`) is the only source for:

- hop / chain distance
- visit order (nearest-neighbor on graph cost)
- routing cost used by pick-route simulation

See `docs/architecture/routing_graph_runtime.md`.

---

## Data Required

1. **Order** — `warehouse_id`, `tenant_id`.
2. **order_items** — `product_id` per line.
3. **inventory** — `location_id` for each product with `quantity > 0`.
4. **Location** — special locations (PICK_START / PACKING) and storage locations.
5. **Authored routing graph** — nodes, edges, Location Access (published from Designer TRASY).

No Euclidean visit-order fallback for runtime WMS / analytics simulation when the graph is missing — callers surface `ROUTING_GRAPH_NOT_CONFIGURED` (or equivalent).

---

## Start / End

- **Preferred start:** `PICK_START` special location (or packing/entry per simulation contract).
- **Preferred end:** `PACKING` special location.

Implemented via analytics / simulation services using Runtime Graph Reader chain APIs.

---

## Path Algorithm

1. Resolve inventory locations for the order.
2. **Visit order** — `order_location_ids_by_graph` (NN on graph hop cost).
3. **Distance** — `chain_distance_m` / engine path along authored edges (not straight-line XY).
4. Response includes route nodes/coordinates for visualization when available.

---

## Related

- `docs/PICK_ROUTE_SYSTEM.md` — START / PACKING locations
- `docs/architecture/routing_graph_runtime.md` — SSOT contract
