"""
API: Warehouse graph visualization (Stage 2 — authored Routing Graph SSOT).

Legacy WarehouseNode/Edge endpoints are replaced by projections of
WarehouseRoutingNode/Edge. POST generate is removed (author in Designer TRASY).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.warehouse_routing.graph_service import get_graph
from ..services.warehouse_routing.access_resolution import is_routing_graph_configured

router = APIRouter(prefix="/warehouse-graph", tags=["Warehouse Graph"])


def _stable_int_id(uuid: str) -> int:
    """Stable positive int for FE types that still expect numeric node/edge ids."""
    h = 0
    for ch in uuid:
        h = (h * 131 + ord(ch)) & 0x7FFFFFFF
    return h or 1


@router.post("/{warehouse_id}/generate")
def generate_warehouse_graph(warehouse_id: int, db: Session = Depends(get_db)):
    """Removed: auto-generated graph is retired. Author network in Designer → TRASY."""
    raise HTTPException(
        status_code=410,
        detail={
            "code": "LEGACY_GRAPH_GENERATE_REMOVED",
            "message": "Auto-generowanie grafu usunięte. Skonfiguruj sieć tras w trybie TRASY projektanta.",
        },
    )


@router.get("/{warehouse_id}/nodes")
def get_warehouse_graph_nodes(warehouse_id: int, db: Session = Depends(get_db)):
    """Project authored routing nodes into legacy viz shape (read-only)."""
    if not is_routing_graph_configured(db, warehouse_id):
        return []
    g = get_graph(db, warehouse_id)
    return [
        {
            "id": _stable_int_id(n.uuid),
            "uuid": n.uuid,
            "warehouse_id": warehouse_id,
            "x": n.x,
            "y": n.y,
            "type": n.operational_type or n.node_type,
            "locations_count": 0,
            "location_ids": [],
        }
        for n in g.nodes
    ]


@router.get("/{warehouse_id}/edges")
def get_warehouse_graph_edges(warehouse_id: int, db: Session = Depends(get_db)):
    """Project authored routing edges into legacy viz shape (read-only)."""
    if not is_routing_graph_configured(db, warehouse_id):
        return []
    g = get_graph(db, warehouse_id)
    uuid_to_id = {n.uuid: _stable_int_id(n.uuid) for n in g.nodes}
    return [
        {
            "id": _stable_int_id(e.uuid),
            "uuid": e.uuid,
            "warehouse_id": warehouse_id,
            "node_from_id": uuid_to_id.get(e.from_node_uuid, 0),
            "node_to_id": uuid_to_id.get(e.to_node_uuid, 0),
            "distance_m": e.distance_m,
            "enabled": e.enabled,
        }
        for e in g.edges
        if e.enabled
    ]
