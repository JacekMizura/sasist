"""
API: Warehouse graph (nodes and edges for navigation / analytics).

GET  /warehouse-graph/{warehouse_id}/nodes
GET  /warehouse-graph/{warehouse_id}/edges
POST /warehouse-graph/{warehouse_id}/generate  — generate graph from Location coordinates

Foundation for route optimization and walking distance. Does not modify existing logic.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.warehouse_graph_service import WarehouseGraphService

router = APIRouter(prefix="/warehouse-graph", tags=["Warehouse Graph"])


@router.post("/{warehouse_id}/generate")
def generate_warehouse_graph(warehouse_id: int, db: Session = Depends(get_db)):
    """
    Generate graph nodes and edges from Location coordinates (locations.x, locations.y).
    Creates nodes every 5 m, edges when distance < 6 m, and links each location to nearest node.
    After this, GET .../nodes and GET .../edges return data.
    """
    service = WarehouseGraphService(db)
    return service.generate_graph_for_warehouse(warehouse_id)


@router.get("/{warehouse_id}/nodes")
def get_warehouse_graph_nodes(warehouse_id: int, db: Session = Depends(get_db)):
    """Return all graph nodes for the warehouse (for analytics visualization)."""
    service = WarehouseGraphService(db)
    return service.get_nodes(warehouse_id)


@router.get("/{warehouse_id}/edges")
def get_warehouse_graph_edges(warehouse_id: int, db: Session = Depends(get_db)):
    """Return all graph edges for the warehouse (walkable paths between nodes)."""
    service = WarehouseGraphService(db)
    return service.get_edges(warehouse_id)
