"""
API: Route path compatibility adapter.

POST /route/path — preserves request/response contract for Designer remnants,
but computes path exclusively via Warehouse Routing Engine (authored graph).

This is NOT a second engine. No legacy auto-graph imports.
Missing graph → ROUTING_GRAPH_NOT_CONFIGURED (no silent fallback).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.warehouse_routing.access_resolution import route_between_points_cm
from ..services.warehouse_routing.constants import ERROR_ROUTING_GRAPH_NOT_CONFIGURED

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
    message: str | None = None
    # Compatibility metadata (optional for old clients)
    engine: str = "warehouse_routing"
    error_code: str | None = None


@router.post("/path", response_model=RoutePathResponse)
def route_path(request: RoutePathRequest, db: Session = Depends(get_db)):
    """
    Compatibility layer: nearest authored nodes + Routing Engine A→B.
    Missing graph → 400 ROUTING_GRAPH_NOT_CONFIGURED (no legacy fallback).
    """
    warehouse_id = int(request.warehouseId)
    res = route_between_points_cm(
        db,
        warehouse_id,
        request.from_.x,
        request.from_.y,
        request.to.x,
        request.to.y,
        process_type=None,
        transport_type=None,
    )

    if res.error_code == ERROR_ROUTING_GRAPH_NOT_CONFIGURED:
        raise HTTPException(
            status_code=400,
            detail={
                "code": ERROR_ROUTING_GRAPH_NOT_CONFIGURED,
                "message": res.message
                or "Brak skonfigurowanej sieci tras. Skonfiguruj sieć w trybie TRASY.",
            },
        )

    if not res.ok:
        return RoutePathResponse(
            points=[],
            distance=None,
            message=res.message or "No path found between the selected points.",
            error_code=res.error_code,
        )

    points = [PointCm(x=p.x, y=p.y) for p in res.nodes]
    logger.info(
        "ROUTE PATH (warehouse_routing): warehouse_id=%s hops=%s distance_m=%s",
        warehouse_id,
        res.hop_count,
        res.distance_m,
    )
    return RoutePathResponse(
        points=points,
        distance=float(res.distance_m) if res.distance_m is not None else None,
        message=None,
        error_code=None,
    )
