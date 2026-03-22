"""
Warehouse graph service: nodes, edges, and location–node linking.

Foundation for walking distance, optimal routes, workload simulation, slotting.
Does not modify existing order/inventory/designer logic.
"""

import math
import logging
import json
from collections import deque
from typing import List, Tuple, Dict, Set, Optional

from sqlalchemy.orm import Session

from ..models.warehouse import Warehouse
from ..models.warehouse import WarehouseLayout, Rack as LayoutRack
from ..models.location import Location
from .graph_location_service import assign_locations_to_graph_nodes
from ..models.warehouse_graph import (
    WarehouseNode,
    WarehouseEdge,
    LocationNode,
    NODE_TYPE_INTERSECTION,
    NODE_TYPE_PACKING,
    NODE_TYPE_OTHER,
)

logger = logging.getLogger(__name__)

# SQLite limits bind parameters per statement (~999); batch IN (...) deletes accordingly.
_GRAPH_DELETE_BATCH_SIZE = 500


def _delete_location_nodes_by_node_ids_batch(db: Session, node_ids: List[int]) -> None:
    """Delete LocationNode rows where node_id is in node_ids, in batches."""
    if not node_ids:
        return
    total = len(node_ids)
    logger.info("[Graph] deleting LocationNode rows in batches: total=%s batch_size=%s", total, _GRAPH_DELETE_BATCH_SIZE)
    for i in range(0, total, _GRAPH_DELETE_BATCH_SIZE):
        batch = node_ids[i : i + _GRAPH_DELETE_BATCH_SIZE]
        db.query(LocationNode).filter(LocationNode.node_id.in_(batch)).delete(synchronize_session=False)

# Grid step for node generation: every 5 meters. Location coords are in cm, so 5m = 500 cm.
STEP_CM = 500.0
# Max distance for an edge: 6 meters (connect nearby nodes only).
MAX_EDGE_DISTANCE_CM = 600.0
CM_TO_M = 0.01
GRID_UNIT_CM = 10.0  # Layout grid unit: 10 cm per cell


def _euclidean_m(x1: float, y1: float, x2: float, y2: float) -> float:
    """Euclidean distance in meters. Input coordinates in cm."""
    dx = (x2 - x1) * CM_TO_M
    dy = (y2 - y1) * CM_TO_M
    return round(math.sqrt(dx * dx + dy * dy), 4)


def _nearest_neighbor_ids(
    nodes: List[WarehouseNode],
    from_idx: int,
    max_neighbors: int = 8,
    max_distance_cm: float | None = None,
) -> List[Tuple[int, float]]:
    """Return list of (node_index, distance_m) for nearest neighbors. from_idx in nodes."""
    x0, y0 = nodes[from_idx].x, nodes[from_idx].y
    candidates = []
    for i, n in enumerate(nodes):
        if i == from_idx:
            continue
        d_cm = math.sqrt((n.x - x0) ** 2 + (n.y - y0) ** 2)
        if max_distance_cm is not None and d_cm > max_distance_cm:
            continue
        d_m = d_cm * CM_TO_M
        candidates.append((i, round(d_m, 4)))
    candidates.sort(key=lambda t: t[1])
    return candidates[:max_neighbors]


def _rect_cells(x: int, y: int, w: int, h: int, cols: int, rows: int) -> List[tuple[int, int]]:
    """Return list of (cx, cy) for a rectangle footprint in grid cells (clamped)."""
    out: List[tuple[int, int]] = []
    x0 = max(0, x)
    y0 = max(0, y)
    x1 = min(cols, x + max(0, w))
    y1 = min(rows, y + max(0, h))
    for yy in range(y0, y1):
        for xx in range(x0, x1):
            out.append((xx, yy))
    return out


def _openings_from_wall_elements(
    wall_elements: list,
    cols: int,
    rows: int,
) -> Set[tuple[int, int]]:
    """
    Convert wall_elements (doors/gates on perimeter) into a set of walkable boundary cells (openings).
    wall: north/south → along X; east/west → along Y. position_cm and width_cm are in cm.
    """
    openings: Set[tuple[int, int]] = set()
    for e in wall_elements or []:
        try:
            wall = str(e.get("wall") or "").lower()
            pos_cm = float(e.get("position_cm") or 0)
            width_cm = float(e.get("width_cm") or 0)
        except Exception:
            continue
        if width_cm <= 0:
            continue
        start_cell = int(max(0.0, pos_cm // GRID_UNIT_CM))
        span_cells = max(1, int(math.ceil(width_cm / GRID_UNIT_CM)))
        if wall in ("north", "south"):
            y = 0 if wall == "north" else max(0, rows - 1)
            for x in range(start_cell, min(cols, start_cell + span_cells)):
                openings.add((x, y))
        elif wall in ("west", "east"):
            x = 0 if wall == "west" else max(0, cols - 1)
            for y in range(start_cell, min(rows, start_cell + span_cells)):
                openings.add((x, y))
    return openings


def _neighbors4(x: int, y: int) -> List[tuple[int, int]]:
    return [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)]


def _in_bounds(x: int, y: int, cols: int, rows: int) -> bool:
    return 0 <= x < cols and 0 <= y < rows


def _nearest_walkable_cell(
    walkable: List[List[bool]],
    start: tuple[int, int],
) -> Optional[tuple[int, int]]:
    """BFS to find nearest walkable cell from start. walkable[x][y]."""
    cols = len(walkable)
    rows = len(walkable[0]) if cols else 0
    sx, sy = start
    sx = max(0, min(cols - 1, sx))
    sy = max(0, min(rows - 1, sy))
    if walkable[sx][sy]:
        return (sx, sy)
    q = deque([(sx, sy)])
    seen: Set[tuple[int, int]] = {(sx, sy)}
    while q:
        x, y = q.popleft()
        for nx, ny in _neighbors4(x, y):
            if not _in_bounds(nx, ny, cols, rows) or (nx, ny) in seen:
                continue
            if walkable[nx][ny]:
                return (nx, ny)
            seen.add((nx, ny))
            q.append((nx, ny))
    return None


def _grid_to_graph(
    walkable: List[List[bool]],
    step_cells: int = 5,
) -> tuple[Dict[tuple[int, int], int], List[tuple[int, int]], List[tuple[int, int, float]]]:
    """
    Build a sparse graph from a walkable 4-neighbor grid.
    - Nodes at endpoints/intersections (degree != 2) plus corridor nodes every step_cells.
    - Edges between nodes along straight corridors with distance in meters.
    Returns: (cell_to_node_idx, node_cells, edges(node_i, node_j, dist_m)).
    """
    cols = len(walkable)
    rows = len(walkable[0]) if cols else 0

    def deg(x: int, y: int) -> int:
        d = 0
        for nx, ny in _neighbors4(x, y):
            if _in_bounds(nx, ny, cols, rows) and walkable[nx][ny]:
                d += 1
        return d

    node_cells: List[tuple[int, int]] = []
    cell_to_node_idx: Dict[tuple[int, int], int] = {}

    # First pass: intersections/endpoints
    for y in range(rows):
        for x in range(cols):
            if not walkable[x][y]:
                continue
            d = deg(x, y)
            if d != 2:
                idx = len(node_cells)
                node_cells.append((x, y))
                cell_to_node_idx[(x, y)] = idx

    # Second pass: corridor centers every N cells to reduce long edges
    if step_cells > 1:
        for y in range(rows):
            run = 0
            last_was_walkable = False
            for x in range(cols):
                if walkable[x][y] and deg(x, y) == 2:
                    run = run + 1 if last_was_walkable else 1
                    last_was_walkable = True
                    if run % step_cells == 0 and (x, y) not in cell_to_node_idx:
                        idx = len(node_cells)
                        node_cells.append((x, y))
                        cell_to_node_idx[(x, y)] = idx
                else:
                    run = 0
                    last_was_walkable = False
        for x in range(cols):
            run = 0
            last_was_walkable = False
            for y in range(rows):
                if walkable[x][y] and deg(x, y) == 2:
                    run = run + 1 if last_was_walkable else 1
                    last_was_walkable = True
                    if run % step_cells == 0 and (x, y) not in cell_to_node_idx:
                        idx = len(node_cells)
                        node_cells.append((x, y))
                        cell_to_node_idx[(x, y)] = idx
                else:
                    run = 0
                    last_was_walkable = False

    edges: List[tuple[int, int, float]] = []
    seen: Set[tuple[int, int]] = set()
    # Walk corridors from each node in 4 directions until next node
    for (x, y), i in cell_to_node_idx.items():
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nx, ny = x + dx, y + dy
            if not _in_bounds(nx, ny, cols, rows) or not walkable[nx][ny]:
                continue
            # Follow corridor
            steps = 1
            cx, cy = nx, ny
            pdx, pdy = dx, dy
            while True:
                if (cx, cy) in cell_to_node_idx and (cx, cy) != (x, y):
                    j = cell_to_node_idx[(cx, cy)]
                    a, b = (i, j) if i < j else (j, i)
                    if (a, b) not in seen:
                        seen.add((a, b))
                        dist_m = steps * (GRID_UNIT_CM * CM_TO_M)
                        edges.append((a, b, round(dist_m, 4)))
                    break
                # advance
                nxts = []
                for tx, ty in _neighbors4(cx, cy):
                    if not _in_bounds(tx, ty, cols, rows) or not walkable[tx][ty]:
                        continue
                    # don't go backwards
                    if tx == cx - pdx and ty == cy - pdy:
                        continue
                    nxts.append((tx, ty))
                if not nxts:
                    break
                # If corridor branches without node marker, stop (shouldn't happen often)
                if len(nxts) > 1:
                    break
                (tx, ty) = nxts[0]
                pdx, pdy = tx - cx, ty - cy
                cx, cy = tx, ty
                steps += 1

    return cell_to_node_idx, node_cells, edges


class WarehouseGraphService:
    def __init__(self, db: Session):
        self.db = db

    def get_nodes(self, warehouse_id: int) -> List[dict]:
        """Return all nodes for a warehouse with locations_count and location_ids (bins attached to node)."""
        nodes = (
            self.db.query(WarehouseNode)
            .filter(WarehouseNode.warehouse_id == warehouse_id)
            .all()
        )
        loc_rows = (
            self.db.query(Location.graph_node_id, Location.id)
            .filter(Location.warehouse_id == warehouse_id, Location.graph_node_id.isnot(None))
            .all()
        )
        by_node: dict[int, list[int]] = {}
        for (gid, lid) in loc_rows:
            if gid is not None:
                by_node.setdefault(gid, []).append(lid)
        return [
            {
                "id": n.id,
                "warehouse_id": n.warehouse_id,
                "x": n.x,
                "y": n.y,
                "type": n.type,
                "locations_count": len(by_node.get(n.id, [])),
                "location_ids": by_node.get(n.id, []),
            }
            for n in nodes
        ]

    def get_edges(self, warehouse_id: int) -> List[dict]:
        """Return all edges for a warehouse (for API)."""
        edges = (
            self.db.query(WarehouseEdge)
            .filter(WarehouseEdge.warehouse_id == warehouse_id)
            .all()
        )
        return [
            {
                "id": e.id,
                "warehouse_id": e.warehouse_id,
                "node_from_id": e.node_from_id,
                "node_to_id": e.node_to_id,
                "distance_m": e.distance_m,
            }
            for e in edges
        ]

    def generate_graph_for_warehouse(self, warehouse_id: int) -> dict:
        """
        Generate warehouse graph from Location coordinates.
        1. Load all locations with non-NULL x, y for this warehouse.
        2. Create nodes every 5 m over the bounding box of those locations.
        3. Create edges between nodes when distance < 6 m (distance_m = Euclidean in meters).
        4. Map each location to its nearest node (location_nodes).
        Idempotent: replaces existing graph for this warehouse. Does not modify Location or inventory.
        """
        return self.build_graph(warehouse_id)

    def build_graph(self, warehouse_id: int) -> dict:
        """
        Internal: generate nodes (grid every 5m), connect nodes within 6m, link locations to nearest node.
        Idempotent: deletes existing graph for this warehouse and rebuilds.
        """
        # Delete existing graph for this warehouse (order: location_nodes, edges, nodes)
        node_ids = [
            r[0]
            for r in self.db.query(WarehouseNode.id).filter(WarehouseNode.warehouse_id == warehouse_id).all()
        ]
        if node_ids:
            _delete_location_nodes_by_node_ids_batch(self.db, node_ids)
        # Single warehouse_id filter — no large IN clause (SQLite-safe).
        self.db.query(WarehouseEdge).filter(WarehouseEdge.warehouse_id == warehouse_id).delete(synchronize_session=False)
        self.db.query(WarehouseNode).filter(WarehouseNode.warehouse_id == warehouse_id).delete(synchronize_session=False)
        self.db.flush()

        # Prefer layout-based graph when a warehouse layout exists.
        layout = (
            self.db.query(WarehouseLayout)
            .filter(WarehouseLayout.warehouse_id == warehouse_id)
            .first()
        )
        if layout and layout.grid_cols and layout.grid_rows:
            return self._build_graph_from_layout(warehouse_id, layout)

        # Fallback (legacy): bounding box from locations with coordinates (cm)
        locations = (
            self.db.query(Location)
            .filter(
                Location.warehouse_id == warehouse_id,
                Location.x.isnot(None),
                Location.y.isnot(None),
            )
            .all()
        )
        if not locations:
            # No locations with coords: add a single default node at origin (or warehouse start)
            wh = self.db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
            sx = float(wh.start_x or 0) if wh else 0
            sy = float(wh.start_y or 0) if wh else 0
            n = WarehouseNode(warehouse_id=warehouse_id, x=sx, y=sy, type=NODE_TYPE_PACKING)
            self.db.add(n)
            self.db.commit()
            return {"nodes": 1, "edges": 0, "location_links": 0}

        xs = [float(l.x) for l in locations]
        ys = [float(l.y) for l in locations]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        # Padding so grid covers area
        pad = STEP_CM * 0.5
        min_x -= pad
        min_y -= pad
        max_x += pad
        max_y += pad

        # Grid nodes every STEP_CM (5m)
        nodes: List[WarehouseNode] = []
        x = min_x
        while x <= max_x:
            y = min_y
            while y <= max_y:
                n = WarehouseNode(
                    warehouse_id=warehouse_id,
                    x=round(x, 2),
                    y=round(y, 2),
                    type=NODE_TYPE_INTERSECTION,
                )
                self.db.add(n)
                nodes.append(n)
                y += STEP_CM
            x += STEP_CM
        self.db.flush()
        self.db.refresh(nodes[0]) if nodes else None
        # Reload to get ids
        nodes = (
            self.db.query(WarehouseNode)
            .filter(WarehouseNode.warehouse_id == warehouse_id)
            .order_by(WarehouseNode.id)
            .all()
        )

        # Packing station node at warehouse start
        wh = self.db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
        if wh and (wh.start_x is not None or wh.start_y is not None):
            sx = float(wh.start_x or 0)
            sy = float(wh.start_y or 0)
            packing = WarehouseNode(warehouse_id=warehouse_id, x=sx, y=sy, type=NODE_TYPE_PACKING)
            self.db.add(packing)
            self.db.flush()
            self.db.refresh(packing)
            nodes.append(packing)

        # Edges: connect nodes when distance < 6 m (MAX_EDGE_DISTANCE_CM)
        max_dist_cm = MAX_EDGE_DISTANCE_CM
        seen_edges = set()
        for i, n_from in enumerate(nodes):
            for j, d_m in _nearest_neighbor_ids(nodes, i, max_neighbors=8, max_distance_cm=max_dist_cm):
                if j < i:
                    pair = (j, i)
                else:
                    pair = (i, j)
                if pair in seen_edges:
                    continue
                seen_edges.add(pair)
                e = WarehouseEdge(
                    warehouse_id=warehouse_id,
                    node_from_id=n_from.id,
                    node_to_id=nodes[j].id,
                    distance_m=d_m,
                )
                self.db.add(e)

        # Link each location to nearest node
        for loc in locations:
            lx, ly = float(loc.x), float(loc.y)
            best_node = None
            best_d = float("inf")
            for n in nodes:
                d = (n.x - lx) ** 2 + (n.y - ly) ** 2
                if d < best_d:
                    best_d = d
                    best_node = n
            if best_node:
                # Upsert: one LocationNode per location
                existing = self.db.query(LocationNode).filter(LocationNode.location_id == loc.id).first()
                if existing:
                    existing.node_id = best_node.id
                else:
                    self.db.add(LocationNode(location_id=loc.id, node_id=best_node.id))

        self.db.commit()
        assign_locations_to_graph_nodes(self.db, warehouse_id)
        return {
            "nodes": len(nodes),
            "edges": len(seen_edges),
            "location_links": sum(1 for _ in locations),
        }

    def _build_graph_from_layout(self, warehouse_id: int, layout: WarehouseLayout) -> dict:
        """
        Build navigation graph from warehouse layout (racks + wall elements).
        - Build a walkable grid at 10cm resolution (layout grid).
        - Block rack footprints and perimeter walls.
        - Create openings for doors/gates from wall_elements_json.
        - Generate sparse graph from corridors and link Locations to nearest node.
        Consumer API + route_engine remain unchanged (WarehouseNode/WarehouseEdge/LocationNode).
        """
        cols = int(layout.grid_cols or 0)
        rows = int(layout.grid_rows or 0)
        if cols <= 0 or rows <= 0:
            return {"nodes": 0, "edges": 0, "location_links": 0}

        # walkable[x][y]
        walkable: List[List[bool]] = [[True for _ in range(rows)] for _ in range(cols)]

        # Block rack footprints
        racks: List[LayoutRack] = (
            self.db.query(LayoutRack)
            .filter(LayoutRack.layout_id == layout.id)
            .all()
        )
        for r in racks:
            for (x, y) in _rect_cells(int(r.x), int(r.y), int(r.width), int(r.height), cols, rows):
                walkable[x][y] = False

        # Perimeter walls blocked (1-cell thickness), then open doors/gates
        wall_elements = []
        if getattr(layout, "wall_elements_json", None):
            try:
                wall_elements = json.loads(layout.wall_elements_json) or []
            except Exception:
                wall_elements = []
        openings = _openings_from_wall_elements(wall_elements, cols, rows)
        for x in range(cols):
            walkable[x][0] = False
            walkable[x][rows - 1] = False
        for y in range(rows):
            walkable[0][y] = False
            walkable[cols - 1][y] = False
        for (x, y) in openings:
            if _in_bounds(x, y, cols, rows):
                walkable[x][y] = True

        # Ensure there is at least some walkable space
        if not any(walkable[x][y] for x in range(cols) for y in range(rows)):
            wh = self.db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
            sx = float(wh.start_x or 0) if wh else 0
            sy = float(wh.start_y or 0) if wh else 0
            n = WarehouseNode(warehouse_id=warehouse_id, x=sx, y=sy, type=NODE_TYPE_PACKING)
            self.db.add(n)
            self.db.commit()
            return {"nodes": 1, "edges": 0, "location_links": 0}

        # Build sparse graph from grid corridors
        cell_to_idx, node_cells, edges = _grid_to_graph(walkable, step_cells=5)

        # Add nodes to DB
        nodes: List[WarehouseNode] = []
        for (cx, cy) in node_cells:
            n = WarehouseNode(
                warehouse_id=warehouse_id,
                x=round((cx + 0.5) * GRID_UNIT_CM, 2),
                y=round((cy + 0.5) * GRID_UNIT_CM, 2),
                type=NODE_TYPE_INTERSECTION,
            )
            self.db.add(n)
            nodes.append(n)
        self.db.flush()

        # Packing/start node (snap to nearest walkable cell)
        wh = self.db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
        if wh and (wh.start_x is not None or wh.start_y is not None):
            sx = float(wh.start_x or 0)
            sy = float(wh.start_y or 0)
            sc = (int(max(0.0, min(cols - 1, sx // GRID_UNIT_CM))), int(max(0.0, min(rows - 1, sy // GRID_UNIT_CM))))
            nearest = _nearest_walkable_cell(walkable, sc)
            if nearest:
                cx, cy = nearest
                packing = WarehouseNode(
                    warehouse_id=warehouse_id,
                    x=round((cx + 0.5) * GRID_UNIT_CM, 2),
                    y=round((cy + 0.5) * GRID_UNIT_CM, 2),
                    type=NODE_TYPE_PACKING,
                )
                self.db.add(packing)
                self.db.flush()
                nodes.append(packing)

        # Reload nodes to have ids aligned with node_cells order
        db_nodes = (
            self.db.query(WarehouseNode)
            .filter(WarehouseNode.warehouse_id == warehouse_id)
            .order_by(WarehouseNode.id)
            .all()
        )
        # Edges between grid nodes (use ids by index in insertion order for node_cells)
        seen_edges: Set[tuple[int, int]] = set()
        # Map local node index to DB node id: nodes are inserted in node_cells order, then optional packing appended.
        local_to_db: Dict[int, int] = {}
        for i, n in enumerate(nodes[: len(node_cells)]):
            local_to_db[i] = n.id

        for (i, j, d_m) in edges:
            if i not in local_to_db or j not in local_to_db:
                continue
            a = local_to_db[i]
            b = local_to_db[j]
            key = (a, b) if a < b else (b, a)
            if key in seen_edges:
                continue
            seen_edges.add(key)
            self.db.add(
                WarehouseEdge(
                    warehouse_id=warehouse_id,
                    node_from_id=a,
                    node_to_id=b,
                    distance_m=d_m,
                )
            )

        # Link each location to nearest node (avoid blocked cell by snapping to nearest walkable)
        locations = (
            self.db.query(Location)
            .filter(Location.warehouse_id == warehouse_id, Location.x.isnot(None), Location.y.isnot(None))
            .all()
        )
        # Use only intersection nodes for assignment by distance; packing is also fine if nearest.
        assign_nodes = (
            self.db.query(WarehouseNode)
            .filter(WarehouseNode.warehouse_id == warehouse_id)
            .all()
        )
        for loc in locations:
            lx, ly = float(loc.x), float(loc.y)
            sc = (int(max(0.0, min(cols - 1, lx // GRID_UNIT_CM))), int(max(0.0, min(rows - 1, ly // GRID_UNIT_CM))))
            nearest_cell = _nearest_walkable_cell(walkable, sc)
            if nearest_cell is None:
                continue
            # Project to that cell center in cm for nearest-node search
            px = (nearest_cell[0] + 0.5) * GRID_UNIT_CM
            py = (nearest_cell[1] + 0.5) * GRID_UNIT_CM
            best_node = None
            best_d = float("inf")
            for n in assign_nodes:
                d = (n.x - px) ** 2 + (n.y - py) ** 2
                if d < best_d:
                    best_d = d
                    best_node = n
            if best_node:
                existing = self.db.query(LocationNode).filter(LocationNode.location_id == loc.id).first()
                if existing:
                    existing.node_id = best_node.id
                else:
                    self.db.add(LocationNode(location_id=loc.id, node_id=best_node.id))

        self.db.commit()
        # Keep compatibility: also set Location.graph_node_id field
        assign_locations_to_graph_nodes(self.db, warehouse_id)
        return {"nodes": len(assign_nodes), "edges": len(seen_edges), "location_links": len(locations)}
