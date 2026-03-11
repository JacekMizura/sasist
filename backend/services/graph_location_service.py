"""
Connect Location (storage bins) to the warehouse walking graph.

Assigns each location with coordinates to the nearest graph node (Location.graph_node_id)
and keeps location_nodes table in sync for walking-cost and API.
"""

import math
import logging
from sqlalchemy.orm import Session

from ..models.location import Location
from ..models.warehouse_graph import WarehouseNode, LocationNode

logger = logging.getLogger(__name__)


def _distance_cm(x1: float, y1: float, x2: float, y2: float) -> float:
    return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)


def assign_locations_to_graph_nodes(db: Session, warehouse_id: int) -> int:
    """
    1. Load all graph nodes for the warehouse.
    2. Load all locations with non-NULL x, y for the warehouse.
    3. For each location, find nearest node by Euclidean distance (cm).
    4. Set location.graph_node_id = nearest_node.id and upsert location_nodes.
    Returns number of locations assigned.
    """
    nodes = (
        db.query(WarehouseNode.id, WarehouseNode.x, WarehouseNode.y)
        .filter(WarehouseNode.warehouse_id == warehouse_id)
        .all()
    )
    if not nodes:
        logger.info("assign_locations_to_graph_nodes: no nodes for warehouse_id=%s", warehouse_id)
        return 0

    locations = (
        db.query(Location)
        .filter(
            Location.warehouse_id == warehouse_id,
            Location.x.isnot(None),
            Location.y.isnot(None),
        )
        .all()
    )
    count = 0
    for loc in locations:
        lx, ly = float(loc.x), float(loc.y)
        best_node_id = None
        best_d = float("inf")
        for n in nodes:
            d = _distance_cm(lx, ly, float(n.x), float(n.y))
            if d < best_d:
                best_d = d
                best_node_id = n.id
        if best_node_id is None:
            continue
        loc.graph_node_id = best_node_id
        count += 1
        ln = db.query(LocationNode).filter(LocationNode.location_id == loc.id).first()
        if ln:
            ln.node_id = best_node_id
        else:
            db.add(LocationNode(location_id=loc.id, node_id=best_node_id))
    db.commit()
    return count
