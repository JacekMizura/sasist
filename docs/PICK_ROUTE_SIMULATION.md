# Pick Route Simulation

This document describes the **warehouse picking path simulation**: how the shortest walking route for picking an order is calculated and exposed.

---

## Goal

- For a given **order_id**, compute the shortest walking path that:
  1. Starts at the packing station (or warehouse entry).
  2. Visits each pick location (storage bin) where the order’s products are stored.
  3. Uses the existing warehouse graph (nodes and edges with distances).

- The result is used to:
  - Estimate **total walking distance** (meters).
  - Estimate **picking time** (using a fixed walking speed).
  - Visualize the route on the warehouse graph (frontend: Analysis → Symulacja trasy).

---

## Data Required

For a given **order_id** the system uses:

1. **Order** — to get `warehouse_id` and `tenant_id`.
2. **order_items** — to get `product_id` for each line.
3. **inventory** — to get `location_id` for each (warehouse_id, product_id) with `quantity > 0`. One location per product (e.g. `MIN(location_id)` per product).
4. **Location** — for each pick location: `x`, `y`, `graph_node_id`. If `graph_node_id` is NULL, it is resolved via **location_nodes** (LocationNode.node_id).
5. **warehouse_nodes** — graph vertices (coordinates `x`, `y`; type e.g. `packing`, `intersection`).
6. **warehouse_edges** — walkable links between nodes with `distance_m`.

No new tables; only existing schema.

---

## Start Point

- **Preferred:** node with `type = 'packing'` in the order’s warehouse.
- **Fallback:** among all nodes in that warehouse, the one **nearest to (0, 0)** (Euclidean distance).

Implemented in `_start_node_for_warehouse(db, warehouse_id)` in `backend/services/analytics_service.py`.

---

## Graph

- **Nodes:** `warehouse_nodes` for the warehouse (id, x, y, type).
- **Edges:** `warehouse_edges` (node_from_id, node_to_id, distance_m). Treated as **undirected**: each edge is used in both directions.
- **Adjacency list:** `node_id → [(neighbor_id, distance_m), ...]` built in `_build_graph_adj(db, warehouse_id)`.

---

## Path Algorithm

### Dijkstra

- **Distance only:** `_dijkstra_dist(adj, start, end)` returns the shortest distance (meters) between two nodes.
- **Path:** `_dijkstra_path(adj, start, end)` returns `(distance_m, [node_id, ...])` so the exact sequence of nodes can be drawn.

### Pick order: nearest neighbor

A simple heuristic approximates the “visit all pick locations” order (traveling salesman style):

1. Start at the **start node** (packing or nearest to (0,0)).
2. Among **unvisited pick nodes**, choose the one **closest** (by Dijkstra distance from the current node).
3. Move to that node and mark it visited.
4. Repeat until all pick nodes are visited.

So the **visit order** is: `start_node → pick_1 → pick_2 → … → pick_k`.

### Full path on the graph

- For each consecutive pair in the visit order, the **shortest path** on the graph is computed with `_dijkstra_path`.
- These path segments are concatenated (without duplicating the joining node) to form the **full route** as a list of node IDs.
- Coordinates for the response come from `warehouse_nodes` (x, y) for each node in that list.

---

## Route Metrics

- **total_distance_meters** — Sum of the Dijkstra segment distances along the full path (start → pick1 → … → pickN).
- **Walking speed** — **1.4 m/s** (constant).
- **estimated_time_seconds** — `total_distance / 1.4`, rounded to one decimal.

Defined in the backend as `WALKING_SPEED_M_S = 1.4`.

---

## API

- **Single order:** `GET /analysis/pick-route/{order_id}`
- **Batch:** `POST /analysis/pick-route/batch` — body: `{ "warehouse_id": int, "order_ids": [int] }`. Returns `{ orders_count, total_distance, estimated_time, routes: [{ order_id, distance, estimated_time, route: [{x,y}, ...] }] }`. Only orders that belong to the given `warehouse_id` are included.

**Single-order response:**

```json
{
  "warehouse_id": 1,
  "route": [
    { "node_id": 10, "x": 500.0, "y": 300.0 },
    { "node_id": 12, "x": 600.0, "y": 300.0 }
  ],
  "total_distance": 45.5,
  "estimated_time": 32.5,
  "pick_locations": [
    { "location_id": 101, "location_name": "A1-01-02", "x": 550.0, "y": 310.0 }
  ]
}
```

- **route** — Sequence of graph nodes (node_id, x, y) along the full path. Suitable for drawing a polyline (e.g. red line on the map).
- **pick_locations** — Storage locations visited, in **visit order**, with id, name, and coordinates (from Location).
- If the order is not found or has no items, `route` and `pick_locations` may be empty; optional `error` or `warehouse_id: null` can be present.

---

## Frontend Visualization

- **Page:** Analysis → **Symulacja trasy** (Pick Path Simulation).
- **Flow:** User selects warehouse, then an order from that warehouse. The app calls `GET /analysis/pick-route/{order_id}` and, using `warehouse_id` from the response, loads the warehouse graph (`GET /warehouse-graph/{warehouse_id}/nodes` and `.../edges`).
- **Drawing:**
  - **Blue:** Graph edges (lines) and nodes (circles).
  - **Red:** Picking route (polyline from `route`), with optional highlight on route nodes.
- **Info:** Total distance (m) and estimated time (s) are shown.

---

## Debug Logging

The backend logs (e.g. `logger.info`) for each request:

- **order_id**
- **number_of_picks** (distinct pick nodes visited)
- **total_distance**

Example: `pick_route: order_id=42 number_of_picks=5 total_distance=67.32`

---

## Assumptions and Limitations

1. **One location per product** — For each product in the order, a single storage location is used (e.g. minimum location_id per product in inventory). Multiple locations per product are not aggregated.
2. **Nearest neighbor** — The visit order is a heuristic; it does not guarantee the globally shortest route (TSP).
3. **Walking speed** — Constant 1.4 m/s; no distinction between empty walk and carrying.
4. **Coordinates** — Node and location coordinates are in the same system (e.g. cm). The frontend scales them for display.
5. **Graph required** — If the warehouse has no graph (no nodes/edges) or locations have no `graph_node_id` / `location_nodes` link, the route may be empty or fall back to a straight sequence without pathfinding.

---

## Implementation

- **Service:** `backend/services/analytics_service.py` — `get_pick_route(db, order_id)`, `_dijkstra_path`, `_build_graph_adj`, `_start_node_for_warehouse`.
- **API:** `backend/api/analysis.py` — `GET /analysis/pick-route/{order_id}`.
- **Frontend:** `frontend/src/pages/Analysis/PickPathSimulation.tsx`.
