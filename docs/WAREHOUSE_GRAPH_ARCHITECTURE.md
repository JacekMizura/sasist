# Warehouse Graph Architecture

Foundation for warehouse navigation and advanced analytics. The graph represents walkable paths so that distance and routes follow aisles rather than straight lines.

---

## Overview

- **Nodes** — Vertices: intersections, aisle entries, packing stations, charging points.
- **Edges** — Walkable paths between nodes; each edge has a length in meters (`distance_m`).
- **Location mapping** — Each storage `Location` is linked to the **nearest** graph node via `LocationNode`. Walking distance to a location is computed as distance to its node (future route algorithms will use the graph).

Existing logic (orders, inventory, warehouse designer, analytics) is **unchanged**. The graph is additional infrastructure only.

---

## Nodes (`warehouse_nodes`)

| Column         | Type    | Description |
|----------------|---------|-------------|
| id             | PK      | From BaseModelMixin |
| warehouse_id   | FK      | → warehouses.id (CASCADE) |
| x              | Float   | Position (same units as Location: cm) |
| y              | Float   | Position |
| type           | String  | `intersection` \| `aisle_entry` \| `packing` \| `charging` \| `other` |
| created_at, updated_at | DateTime | From BaseModelMixin |

**Types:**

- `intersection` — Grid / aisle intersection (default for generated nodes).
- `aisle_entry` — Entry to an aisle (for future refinement).
- `packing` — Packing station / picker start (e.g. at `warehouse.start_x`, `start_y`).
- `charging` — Charging or other special point.
- `other` — Reserved.

---

## Edges (`warehouse_edges`)

| Column       | Type  | Description |
|--------------|-------|-------------|
| id           | PK    | From BaseModelMixin |
| warehouse_id | FK    | → warehouses.id (CASCADE) |
| node_from_id | FK    | → warehouse_nodes.id (CASCADE) |
| node_to_id   | FK    | → warehouse_nodes.id (CASCADE) |
| distance_m   | Float | Length of the path in **meters** |
| created_at, updated_at | DateTime | From BaseModelMixin |

Edges are created between **nearest neighboring** nodes. `distance_m` is the Euclidean distance between node positions, converted to meters (coordinates are stored in cm).

---

## Location mapping (`location_nodes`)

| Column      | Type | Description |
|-------------|------|-------------|
| id          | PK   | From BaseModelMixin |
| location_id | FK   | → locations.id (CASCADE), **unique** (one node per location) |
| node_id     | FK   | → warehouse_nodes.id (CASCADE) |
| created_at, updated_at | DateTime | From BaseModelMixin |

Each storage **Location** (pick slot) is attached to exactly one **WarehouseNode** — the nearest node by Euclidean distance. This allows:

- Walking distance = distance to the **node**, not to the raw (x, y) of the location.
- Route optimization to use the graph (nodes + edges) instead of straight-line segments.

---

## Node generation (current logic)

Implemented in `backend/services/warehouse_graph_service.py`:

1. **Bounding box** — From all `Location` rows with non-NULL `x`, `y` for the warehouse.
2. **Grid nodes** — Nodes are placed every **5 meters** (500 cm) in a grid over the bounding box. Type: `intersection`.
3. **Packing node** — If the warehouse has `start_x` / `start_y`, one extra node of type `packing` is added at that position.
4. **Edges** — Each node is connected to others within **6 meters** (Euclidean). Edge length = Euclidean distance in meters.
5. **Location links** — For each `Location` with coordinates, find the nearest node and create (or update) a `LocationNode` row.

---

## Graph generation from Location coordinates

The graph is generated from existing **Location** coordinates (`locations.x`, `locations.y`). No graph data exists until generation is run.

**Trigger:** `POST /warehouse-graph/{warehouse_id}/generate`

**Steps:**

1. **Load locations** — `SELECT id, x, y FROM locations WHERE warehouse_id = ? AND x IS NOT NULL AND y IS NOT NULL`. Locations with NULL x or y are skipped.
2. **Create nodes** — A grid of nodes is created every **5 meters** over the bounding box of those locations. Node positions use the same coordinate system as Location (cm). Additional node at packing station (`warehouse.start_x`, `start_y`) if set.
3. **Create edges** — For each pair of nodes, if Euclidean distance &lt; **6 meters**, an edge is inserted. `distance_m = sqrt((x2−x1)² + (y2−y1)²)` (converted to meters).
4. **Map locations** — For each location, find the nearest node and insert into `location_nodes` (location_id, node_id). One row per location.

**Idempotent:** Each run deletes the existing graph for that warehouse and rebuilds from current locations. It does not modify `locations` or inventory.

After a successful run, `GET /warehouse-graph/{warehouse_id}/nodes` and `GET /warehouse-graph/{warehouse_id}/edges` return the generated data.

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/warehouse-graph/{warehouse_id}/generate` | Generate graph from Location coordinates. Returns `{ nodes, edges, location_links }`. |
| GET | `/warehouse-graph/{warehouse_id}/nodes` | List all nodes (id, warehouse_id, x, y, type). For analytics/visualization. |
| GET | `/warehouse-graph/{warehouse_id}/edges` | List all edges (id, warehouse_id, node_from_id, node_to_id, distance_m). |

The POST endpoint fills the graph; GET endpoints are read-only and do not modify orders, inventory, or the designer.

---

## Future use (route optimization)

- **Walking distance** — Sum of edge `distance_m` along the shortest path (e.g. Dijkstra) from packing node to each location’s node, then sum per order.
- **Optimal picking routes** — TSP or similar over the graph (visit each location’s node once, minimize total edge distance).
- **Workload simulation** — Use graph distances instead of straight-line for more realistic times.
- **Slotting optimization** — Move fast-movers to nodes closer to the packing station on the graph.

The graph is the foundation; route algorithms will be added in a later phase.
