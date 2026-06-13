"""Warehouse capacity engine & intelligent putaway API."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from fastapi import Depends
from ..auth.warehouse_deps import (
    require_operable_warehouse,
    require_active_operable_warehouse,
    require_active_or_query_operable_warehouse,
    assert_stock_document_warehouse,
    enforce_warehouse_access,
)
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.slotting import (
    CalculateFitBody,
    CapacityCalculationRead,
    HeatmapLocationRead,
    HeatmapZoneRead,
    LocationCapacityDetailRead,
    OccupancyRecalcRead,
    PutawaySuggestionRead,
    RecalculateOccupancyBody,
    SuggestPutawayBody,
    WarehouseHeatmapRead,
)
from ..services.slotting import (
    LocationNotFoundError,
    ProductNotFoundError,
    SlottingError,
    build_warehouse_heatmap,
    calculate_location_capacity,
    get_location_capacity_detail,
    recalculate_location_occupancy,
    recalculate_warehouse_occupancy,
    suggest_putaway_locations,
)
from ..models.location import Location
from ..models.product import Product

router = APIRouter(prefix="/slotting", tags=["Slotting"])
logger = logging.getLogger(__name__)


def _slotting_http(exc: SlottingError) -> HTTPException:
    status = 404 if exc.code.endswith("_not_found") else 400
    return HTTPException(status_code=status, detail={"code": exc.code, "message": str(exc)})


@router.get("/locations/{location_id}/capacity", response_model=LocationCapacityDetailRead)
def get_location_capacity(
    location_id: int,
    tenant_id: int = Query(..., ge=1),
    product_id: Optional[int] = Query(default=None, ge=1),
    quantity: float = Query(default=0, ge=0),
    packaging_mode: str = Query(default="UNIT"),
    db: Session = Depends(get_db),
):
    try:
        detail = get_location_capacity_detail(
            db,
            tenant_id=tenant_id,
            location_id=location_id,
            product_id=product_id,
            quantity=quantity,
            packaging_mode=packaging_mode,
        )
    except SlottingError as exc:
        raise _slotting_http(exc) from exc
    fit_raw = detail.pop("fit", None)
    fit = CapacityCalculationRead(**fit_raw) if fit_raw else None
    return LocationCapacityDetailRead(**detail, fit=fit)


@router.post("/calculate-fit", response_model=CapacityCalculationRead)
def post_calculate_fit(body: CalculateFitBody, db: Session = Depends(get_db)):
    loc = db.query(Location).filter(Location.id == int(body.location_id)).first()
    if loc is None:
        raise _slotting_http(LocationNotFoundError(f"Location {body.location_id} not found"))
    product = (
        db.query(Product)
        .filter(Product.id == int(body.product_id), Product.tenant_id == int(body.tenant_id))
        .first()
    )
    if product is None:
        raise _slotting_http(ProductNotFoundError(f"Product {body.product_id} not found"))
    result = calculate_location_capacity(loc, product, body.quantity, body.packaging_mode)
    return CapacityCalculationRead(**result.to_dict())


@router.post("/suggest-putaway", response_model=list[PutawaySuggestionRead])
def post_suggest_putaway(body: SuggestPutawayBody, db: Session = Depends(get_db)):
    try:
        rows = suggest_putaway_locations(
            db,
            tenant_id=body.tenant_id,
            warehouse_id=body.warehouse_id,
            product_id=body.product_id,
            quantity=body.quantity,
            packaging_mode=body.packaging_mode,
            preferred_zone=body.preferred_zone,
            strategy=body.strategy,
            limit=body.limit,
        )
    except SlottingError as exc:
        raise _slotting_http(exc) from exc
    out: list[PutawaySuggestionRead] = []
    for row in rows:
        d = row.to_dict()
        cap = d.pop("capacity", None)
        out.append(
            PutawaySuggestionRead(
                **d,
                capacity=CapacityCalculationRead(**cap) if cap else None,
            )
        )
    return out


@router.get("/warehouse-heatmap", response_model=WarehouseHeatmapRead)
def get_warehouse_heatmap(
    warehouse_id: int = Depends(require_operable_warehouse),
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    _ = tenant_id
    raw = build_warehouse_heatmap(db, warehouse_id=warehouse_id, tenant_id=tenant_id)
    return WarehouseHeatmapRead(
        warehouse_id=raw["warehouse_id"],
        zones=[HeatmapZoneRead(**z) for z in raw.get("zones", [])],
        locations=[HeatmapLocationRead(**loc) for loc in raw.get("locations", [])],
        state_counts=raw.get("state_counts", {}),
    )


@router.post("/recalculate-occupancy", response_model=OccupancyRecalcRead)
def post_recalculate_occupancy(body: RecalculateOccupancyBody, db: Session = Depends(get_db)):
    _ = body.tenant_id
    try:
        if body.location_id is not None:
            result = recalculate_location_occupancy(db, int(body.location_id))
            return OccupancyRecalcRead(
                location_id=result["location_id"],
                locations_updated=1,
                occupied_volume_dm3=result["occupied_volume_dm3"],
                occupied_weight_kg=result["occupied_weight_kg"],
                capacity_utilization_percent=result["capacity_utilization_percent"],
                capacity_state=result["capacity_state"],
            )
        if body.warehouse_id is not None:
            bulk = recalculate_warehouse_occupancy(db, int(body.warehouse_id))
            return OccupancyRecalcRead(
                warehouse_id=bulk["warehouse_id"],
                locations_updated=bulk["locations_updated"],
            )
    except SlottingError as exc:
        raise _slotting_http(exc) from exc
    raise HTTPException(status_code=400, detail="Provide location_id or warehouse_id")
