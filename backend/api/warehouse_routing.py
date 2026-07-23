"""
API: Authored Warehouse Routing Graph (NEW SSOT).

Independent from /warehouse-graph (legacy auto graph) and /route/path (legacy Dijkstra).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.warehouse_routing import (
    RouteComputeRequest,
    RouteComputeResponse,
    RoutingGraphOut,
    RoutingGraphReplaceRequest,
    RoutingValidationResult,
)
from ..services.warehouse_routing import get_graph, replace_graph, route_a_to_b, validate_graph
from ..services.warehouse_routing.constants import (
    ERROR_VERSION_CONFLICT,
    RoutingGraphValidationError,
    RoutingGraphVersionConflict,
)

router = APIRouter(prefix="/warehouse-routing", tags=["Warehouse Routing Graph"])


@router.get("/{warehouse_id}/graph", response_model=RoutingGraphOut)
def api_get_routing_graph(warehouse_id: int, db: Session = Depends(get_db)):
    return get_graph(db, warehouse_id)


@router.put("/{warehouse_id}/graph", response_model=RoutingGraphOut)
def api_put_routing_graph(
    warehouse_id: int,
    payload: RoutingGraphReplaceRequest,
    db: Session = Depends(get_db),
):
    """Replace authored graph. Does not modify physical layout or legacy WarehouseNode."""
    try:
        return replace_graph(db, warehouse_id, payload, materialize_crossings=True)
    except RoutingGraphVersionConflict as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "code": ERROR_VERSION_CONFLICT,
                "revision": exc.current_revision,
                "message": (
                    "Konfiguracja tras została zmieniona przez innego użytkownika. "
                    "Odśwież dane i spróbuj ponownie."
                ),
            },
        ) from exc
    except RoutingGraphValidationError as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{warehouse_id}/route", response_model=RouteComputeResponse)
def api_compute_route(
    warehouse_id: int,
    payload: RouteComputeRequest,
    db: Session = Depends(get_db),
):
    """A→B via NEW Routing Engine only (no legacy graph fallback)."""
    return route_a_to_b(db, warehouse_id, payload)


@router.post("/{warehouse_id}/validate", response_model=RoutingValidationResult)
def api_validate_routing_graph(warehouse_id: int, db: Session = Depends(get_db)):
    return validate_graph(db, warehouse_id)
