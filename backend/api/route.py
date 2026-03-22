"""
API: Route path between two points using the warehouse graph.

POST /route/path — shortest path (Dijkstra) from (from.x, from.y) to (to.x, to.y) in cm.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.warehouse_graph import WarehouseNode
from ..domain.simulation.warehouse_graph_service import (
    get_node_nearest_to_point,
    get_adjacency,
    shortest_path_dijkstra,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/route", tags=["Route"])


class PointCm(BaseModel):
    x: float
    y: float


class RoutePathRequest(BaseModel):
    warehouseId: str  # numeric string, e.g. "1"
    from_: PointCm = Field(alias="from", description="Start point (cm)")
    to: PointCm


class RoutePathResponse(BaseModel):
    points: list[PointCm]
    distance: float | None  # meters; None if no path
    message: str | None = None  # e.g. "No path found"


@router.post("/path", response_model=RoutePathResponse)
def route_path(request: RoutePathRequest, db: Session = Depends(get_db)):
    """
    Compute real path between two points using the warehouse graph.
    Finds nearest graph nodes for start/end, runs Dijkstra, returns full path coordinates (cm) and distance (m).
    """
    warehouse_id = int(request.warehouseId)
    from_xy = (request.from_.x, request.from_.y)
    to_xy = (request.to.x, request.to.y)

    adj = get_adjacency(db, warehouse_id)
    if not adj:
        logger.warning("route/path: no graph for warehouse_id=%s", warehouse_id)
        raise HTTPException(status_code=400, detail="No graph for this warehouse. Generate the graph first.")

    start_node = get_node_nearest_to_point(db, warehouse_id, from_xy[0], from_xy[1])
    end_node = get_node_nearest_to_point(db, warehouse_id, to_xy[0], to_xy[1])

    if start_node is None or end_node is None:
        logger.warning("route/path: no nodes for warehouse_id=%s", warehouse_id)
        raise HTTPException(status_code=400, detail="No graph nodes for this warehouse.")

    distance_m, path_node_ids = shortest_path_dijkstra(adj, start_node, end_node)

    logger.info(
        "ROUTE PATH: start_node_id=%s end_node_id=%s path_length=%s distance_m=%s",
        start_node,
        end_node,
        len(path_node_ids),
        distance_m if path_node_ids else "N/A",
    )

    if not path_node_ids:
        return RoutePathResponse(
            points=[],
            distance=None,
            message="No path found between the selected points.",
        )

    # Load node coordinates (cm) in path order
    node_rows = (
        db.query(WarehouseNode.id, WarehouseNode.x, WarehouseNode.y)
        .filter(WarehouseNode.id.in_(path_node_ids))
        .all()
    )
    id_to_xy = {r.id: (float(r.x), float(r.y)) for r in node_rows}
    points = [PointCm(x=id_to_xy[nid][0], y=id_to_xy[nid][1]) for nid in path_node_ids if nid in id_to_xy]

    return RoutePathResponse(
        points=points,
        distance=round(distance_m, 4),
        message=None,
    )
