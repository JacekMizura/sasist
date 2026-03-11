# Warehouse Graph from Layout — Architecture

This document describes the architecture for building the warehouse navigation graph (**WarehouseNode** / **WarehouseEdge**) from the **warehouse layout** (Rack, Aisle) so that nodes exist only in walkable space and edges do not cross racks.

---

## 1. Existing Layout Models (Summary)

### Rack (`warehouse_layout_racks`)

- **Role:** One physical rack in the layout. Defines a **blocked rectangle** in the floor plan.
- **Coordinates:** `x`, `y`, `width`, `height` in **grid units**. One unit = 10 cm (`GRID_UNIT_CM`).
- **In cm:** Rectangle from `(x*10, y*10)` to `((x+width)*10, (y+height)*10)`.
- **Other:** `layout_id`, orientation, levels, bins_per_level, dimensions in cm (length_cm, width_cm, height_cm), aisle_letter, rack_index, internal_structure (JSON).
- **Relationship:** Belongs to one **WarehouseLayout**; has many **Bin**.

### Aisle (`warehouse_aisles`)

- **Role:** Corridor between racks (stored for display and future use). In this proposal, walkable space is defined as **floor minus racks**; aisles are not required to define walkable area but can be used later for refinement (e.g. one-way).
- **Coordinates:** Same grid as Rack: `x`, `y`, `width`, `height` (grid units) → same conversion to cm.
- **Other:** `layout_id`, name, two_way (1 = two-way, 0 = one-way).

### Bin (`warehouse_bins`)

- **Role:** Smallest storage unit inside a rack (one logical pick face). Has a label (e.g. A1-1-3), volume, level_index, segment_index.
- **Relationship:** Belongs to one **Rack**. Physical position is derived from Rack position + internal_structure (not stored on Bin itself).
- **Not used directly for graph:** Graph uses **Location** (which is synced from Bin) and **Rack** (for obstacles).

### Location (`locations`)

- **Role:** Operational storage slot used by inventory, picking, and routing. Has coordinates (x, y, z) in **cm** (center of the bin).
- **Source of coordinates:** Synced from layout when saving: for each Bin, the layout service computes center (x, y) in cm and creates/updates a **Location** row (same warehouse, name = bin label).
- **Graph link:** `graph_node_id` (FK to warehouse_nodes) and **LocationNode** (location_id, node_id). Set by `assign_locations_to_graph_nodes`: each location is attached to the **nearest** graph node.
- **Critical for compatibility:** All routing (Dijkstra, walking-cost, pick-route) uses **Location → node** and then **graph edges**. The new graph must still expose nodes and edges in the same way; only how nodes/edges are *generated* changes.

---

## 2. Proposed Architecture

### Principles

1. **Rack rectangles = blocked areas (obstacles).** Any point inside a Rack rectangle (in cm) is not walkable.
2. **Walkable space = floor minus rack rectangles.** The floor is the layout extent (e.g. from (0,0) to (grid_cols*10, grid_rows*10) cm). Subtract all Rack rectangles (in cm).
3. **WarehouseNode only in walkable areas.** Every node (x, y) must lie in walkable space (not inside any Rack).
4. **WarehouseEdge only if segment is clear.** An edge from node A to node B is created only if the straight segment from A to B does not intersect any Rack rectangle (and optionally does not leave the floor).
5. **Location → nearest reachable node.** Each Location (with x, y) is assigned to the nearest WarehouseNode that is **reachable** on the graph (or, in a first version, nearest by Euclidean distance among nodes that are in walkable space; reachability can be enforced by only considering nodes in the same connected component or by graph distance).

### Data flow (unchanged from consumer perspective)

- **Graph storage:** Same tables — `warehouse_nodes`, `warehouse_edges`, `location_nodes`. Same columns (WarehouseNode.x, y in cm; WarehouseEdge.distance_m; LocationNode links Location to node).
- **Routing:** Existing code that uses `get_adjacency()`, `shortest_path_dijkstra()`, `dijkstra_dist()`, and Location→node mapping continues to work. No change to API or to Dijkstra usage; only the *content* of the graph (where nodes are, which edges exist) changes.

---

## 3. Algorithm: Generate Nodes

### Inputs

- **WarehouseLayout** for the warehouse (with `grid_cols`, `grid_rows` or `width_m`, `length_m` to define floor extent).
- **All Racks** of that layout: for each, compute rectangle in cm:  
  `(x*GRID_UNIT_CM, y*GRID_UNIT_CM)` to `((x+width)*GRID_UNIT_CM, (y+height)*GRID_UNIT_CM)`.
- **Floor extent in cm:** e.g. `[0, 0]` to `[grid_cols*GRID_UNIT_CM, grid_rows*GRID_UNIT_CM]`.

### Walkable test

- A point `(px, py)` in cm is **walkable** if:
  - It lies inside the floor rectangle, and
  - It does **not** lie in the interior (or on the boundary) of any Rack rectangle.
- Option: exclude boundary so that nodes can be placed exactly at rack edges; that is a policy choice (e.g. walkable if strictly outside all racks).

### Node placement strategy

**Option A — Regular grid with filtering (recommended for simplicity)**

1. Choose a **grid step** in cm (e.g. 100 cm or 200 cm). This defines node density.
2. Over the floor extent, generate a grid of candidate points: for each `(gx, gy)` in steps of the grid step, candidate point is e.g. `(gx, gy)` or center of cell.
3. For each candidate point, test **walkable(px, py)**. If walkable, create a **WarehouseNode** with `x = px`, `y = py`, `type = intersection` (or `aisle_entry` if you later use aisles).
4. **Packing / start node:** If the warehouse has `start_x`, `start_y` (or a PACKING / PICK_START Location), place a node at that (x, y) **if** that point is walkable; otherwise place it at the **nearest walkable point** to (start_x, start_y) so that the start is always on the graph.

**Option B — Aisle-centric (if aisles are to drive node density)**

- For each Aisle rectangle, place nodes along the corridor (e.g. along the centerline at a fixed step). Then add nodes at junctions (e.g. where aisles meet). Still apply the walkable test (point must not be inside a Rack). This yields fewer nodes and more aligned with corridors.

**Output**

- A set of **WarehouseNode** rows (warehouse_id, x, y, type), all of which lie in walkable space.

---

## 4. Edge Creation and Rack Collision Check

### Segment–rectangle intersection (edge vs rack)

An edge is **allowed** only if the segment from node A `(ax, ay)` to node B `(bx, by)` does **not** intersect any Rack rectangle.

**Intersection semantics:** The segment intersects a rectangle if:

- The segment crosses any of the four sides of the rectangle (segment–segment intersection), or
- One or both endpoints of the segment lie inside the rectangle.

So: both endpoints must be outside (or on the boundary, depending on policy) of every rack, and the open segment must not cross any rack boundary.

**Algorithm for one segment vs one rectangle**

- Rectangle in cm: `(rx_min, ry_min)` to `(rx_max, ry_max)` (e.g. `rx_min = r.x*10`, `rx_max = (r.x+r.width)*10`).
- Test:
  1. **Endpoint inside:** If A or B is inside the rectangle (inclusive or exclusive bounds), segment intersects.
  2. **Segment–edge intersection:** The segment is a line from A to B. Test whether this segment intersects any of the four rectangle edges (each edge is a segment). Two segments intersect if they share a point and that point is not merely an endpoint of one (or allow endpoint touches depending on whether you consider “touching the rack” as blocked).
- **Recommended:** Consider the rack as a closed rectangle (boundary = blocked). So if the segment touches or crosses the boundary, the edge is **not** allowed. That way no path goes through a rack.

**Algorithm for one edge (A→B) vs all racks**

- For each Rack, compute rectangle in cm. If segment A–B intersects that rectangle, **reject** the edge (do not create WarehouseEdge).
- If no rack intersects the segment, create **WarehouseEdge** with `node_from_id = A.id`, `node_to_id = B.id`, `distance_m = euclidean_distance(A, B) / 100` (convert cm to m).

### Which pairs to test

- **Candidate pairs:** All pairs of nodes (A, B) such that Euclidean distance (A, B) ≤ max edge length (e.g. 6 m as today). For each candidate pair, run the segment–rectangle test against all Racks. Only add the edge if the segment is clear.
- **Optimization:** To avoid testing every pair, you can first build a coarse grid of “walkable cells” and only consider edges between nodes in the same or adjacent walkable cells; then the collision check is still applied to the segment to avoid edges that cross a thin rack corner.

---

## 5. Location → Node Assignment (“Nearest Reachable”)

### Current behavior

- `assign_locations_to_graph_nodes`: for each Location (x, y), find the **nearest** WarehouseNode by Euclidean distance; set `Location.graph_node_id` and upsert **LocationNode**.

### Desired behavior with layout-based graph

- Each Location should be assigned to a node that is **reachable** on the graph (so that Dijkstra from start to that node is finite). So: “nearest” among nodes that are **in the same connected component** as the packing/start node, or simply “nearest node” (since all nodes are now in walkable space and edges only connect clear segments, the graph may still have disconnected components if the layout has isolated walkable islands).
- **Algorithm:**
  1. After building nodes and edges, compute **connected components** of the graph (e.g. by BFS/DFS).
  2. Identify the **main component** that contains the packing/start node (or the largest component).
  3. For each Location (x, y), choose the **nearest** WarehouseNode **that belongs to the main component** (or to any component that contains a node within a small distance of the location). If no such node exists (location in an isolated area), fall back to nearest node by distance and log a warning; routing to that location will then be “no path” until the layout is fixed.
  4. Set `Location.graph_node_id` and upsert **LocationNode** as today.

**Compatibility:** The rest of the system (walking-cost, pick-route, Dijkstra) already uses `Location → node` and graph edges. No change to their logic; they just get a graph that respects obstacles.

---

## 6. Rebuilding the Graph After Layout Changes

### When to rebuild

- **After layout save:** When the user saves the warehouse layout (PUT `/warehouse/{id}/layout`), the set of Racks (and optionally Aisles) changes. The graph must be **rebuilt** from the new layout so that nodes and edges reflect the new obstacles.
- **Explicit rebuild:** Keep the existing endpoint (e.g. POST `/warehouse-graph/{id}/generate`) so that an admin can force a rebuild without saving the layout again (e.g. after manual DB fixes or after switching which layout is “active” if you support multiple layouts later).

### Rebuild sequence

1. **Load layout:** For the given warehouse_id, load the **WarehouseLayout** and all **Rack** (and optionally Aisle) rows. Compute floor extent and list of rack rectangles in cm.
2. **Delete existing graph:** As today: delete **LocationNode** for nodes of this warehouse, then **WarehouseEdge**, then **WarehouseNode** for this warehouse.
3. **Generate nodes:** Run the node-generation algorithm (walkable grid or aisle-centric) and insert **WarehouseNode** rows.
4. **Generate edges:** For each candidate pair of nodes within max edge length, run segment–rectangle collision check; insert **WarehouseEdge** only when the segment is clear.
5. **Assign locations:** Run **assign_locations_to_graph_nodes** with the “nearest reachable node” rule (e.g. restrict to main connected component). This updates **Location.graph_node_id** and **location_nodes**.
6. **Commit.**

### Integration with layout save

- Today, **save_layout** calls `assign_locations_to_graph_nodes` only; it does **not** call `build_graph`. So after a layout change, the graph is stale.
- **New behavior:** After saving the layout (and syncing Location from Bin as today), call the **new** graph build (layout-based) for that warehouse, then call **assign_locations_to_graph_nodes**. So: save_layout → sync Location from bins → **build_graph_from_layout(warehouse_id)** → assign_locations_to_graph_nodes. The existing `assign_locations_to_graph_nodes` can be extended to “nearest reachable” or a separate function can be used after the new build.

---

## 7. Compatibility with LocationNode and Dijkstra Routing

### LocationNode

- **Schema unchanged:** Still one row per Location: `location_id`, `node_id`. The graph builder and assign_locations_to_graph_nodes continue to upsert these rows.
- **Semantics:** Each Location points to the **nearest (reachable)** WarehouseNode. Consumers that resolve “location → node” via LocationNode or Location.graph_node_id work as today.

### Dijkstra routing

- **Input:** Adjacency list built from **WarehouseEdge** (node_id → list of (neighbor_id, distance_m)). Build logic (e.g. `get_adjacency`) is unchanged: iterate over WarehouseEdge, add both directions.
- **Usage:** Walking-cost, pick-route segment distances, and any other feature that uses `shortest_path_dijkstra` or `dijkstra_dist` continue to work. They only see a graph of nodes and edges; the fact that edges now “avoid racks” is transparent.
- **Behavioral change:** Path lengths will become **larger** (more realistic) when routes must go around racks instead of cutting through them. No API or signature change.

### Fallback when no layout

- If the warehouse has **no** WarehouseLayout or no Racks, the graph builder can **fall back** to the current behavior: bounding box from Location (x, y), grid of nodes every 5 m, edges by distance only. That preserves compatibility for warehouses that are not yet designed with the layout tool.

---

## 8. Summary

| Aspect | Current | New (layout-based) |
|--------|--------|--------------------|
| Node placement | Grid over Location bbox, 5 m step | Grid (or aisle-based) over floor, only in walkable (floor − racks) |
| Walkable | Not defined | Floor minus Rack rectangles |
| Edges | All pairs within 6 m | Pairs within 6 m **and** segment does not intersect any Rack |
| Location → node | Nearest node by distance | Nearest **reachable** node (e.g. in main component) |
| Rebuild | On demand (generate); layout save only reassigns locations | On layout save + on explicit generate; full rebuild from Rack/Aisle |
| LocationNode / Dijkstra | Unchanged | Unchanged (same tables and usage) |

The new architecture keeps the same data model and routing APIs; it only changes **how** nodes and edges are generated so that the navigation graph is derived from the warehouse layout and respects rack obstacles.
