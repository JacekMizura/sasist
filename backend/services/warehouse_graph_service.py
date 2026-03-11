"""
Warehouse graph service: nodes, edges, and location–node linking.

Foundation for walking distance, optimal routes, workload simulation, slotting.
Does not modify existing order/inventory/designer logic.
"""

import math
import logging
from typing import List, Tuple

from sqlalchemy.orm import Session

from ..models.warehouse import Warehouse
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

# Grid step for node generation: every 5 meters. Location coords are in cm, so 5m = 500 cm.
STEP_CM = 500.0
# Max distance for an edge: 6 meters (connect nearby nodes only).
MAX_EDGE_DISTANCE_CM = 600.0
CM_TO_M = 0.01


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
            self.db.query(LocationNode).filter(LocationNode.node_id.in_(node_ids)).delete(synchronize_session=False)
        self.db.query(WarehouseEdge).filter(WarehouseEdge.warehouse_id == warehouse_id).delete(synchronize_session=False)
        self.db.query(WarehouseNode).filter(WarehouseNode.warehouse_id == warehouse_id).delete(synchronize_session=False)
        self.db.flush()

        # Bounding box from locations with coordinates (cm)
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
