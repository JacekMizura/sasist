import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.location import Location
from ..services.warehouse_layout_service import WarehouseLayoutService
from ..schemas.warehouse_layout import WarehouseLayoutPayload

router = APIRouter(prefix="/warehouse", tags=["Warehouse Layout"])


class SpecialLocationCreate(BaseModel):
    warehouse_id: int
    x: float
    y: float
    type: Literal["PICK_START", "PACKING", "DOCK"]


class SpecialLocationUpdate(BaseModel):
    x: float
    y: float


def _pdf_response(pdf_bytes: bytes, filename: str) -> Response:
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/layout")
def get_layout(
    tenant_id: int,
    warehouse_id: int,
    db: Session = Depends(get_db),
):
    service = WarehouseLayoutService(db)
    return service.get_layout(tenant_id, warehouse_id)


logger = logging.getLogger(__name__)


@router.get("/layout/labels")
def get_location_labels(
    tenant_id: int,
    warehouse_id: int,
    template_id: int | None = None,
    db: Session = Depends(get_db),
):
    """Generate location labels PDF using the label template system. Use default location template if template_id not provided."""
    try:
        service = WarehouseLayoutService(db)
        pdf_bytes = service.get_location_labels_pdf(tenant_id, warehouse_id, template_id=template_id)
        return _pdf_response(pdf_bytes, f"location-labels-warehouse-{warehouse_id}.pdf")
    except Exception as e:
        logger.exception("Location labels PDF generation failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/layout")
def save_layout(
    tenant_id: int,
    warehouse_id: int,
    data: WarehouseLayoutPayload,
    db: Session = Depends(get_db),
):
    service = WarehouseLayoutService(db)
    return service.save_layout(tenant_id, warehouse_id, data.model_dump())


@router.put("/{warehouse_id}/layout")
def put_layout(
    warehouse_id: int,
    tenant_id: int,
    data: WarehouseLayoutPayload,
    db: Session = Depends(get_db),
):
    """Save entire layout state (positions, rotations, rack IDs). Updates StorageLocation coordinates."""
    service = WarehouseLayoutService(db)
    return service.save_layout(tenant_id, warehouse_id, data.model_dump())


@router.post("/special-location")
def create_special_location(
    body: SpecialLocationCreate,
    db: Session = Depends(get_db),
):
    """
    Create a special location (PICK_START, PACKING, or DOCK) for a warehouse.
    Only one PICK_START per warehouse; creating a new one replaces the previous.
    """
    if body.type == "PICK_START":
        existing = (
            db.query(Location)
            .filter(Location.warehouse_id == body.warehouse_id, Location.location_type == "PICK_START")
            .all()
        )
        for loc in existing:
            db.delete(loc)
        db.flush()
    names = {"PICK_START": "START", "PACKING": "PACK", "DOCK": "DOCK"}
    name = names.get(body.type, body.type)
    loc = Location(
        warehouse_id=body.warehouse_id,
        name=name,
        type="pick",
        location_type=body.type,
        x=body.x,
        y=body.y,
    )
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return {"id": loc.id, "x": float(loc.x or 0), "y": float(loc.y or 0), "location_type": loc.location_type}


@router.get("/{warehouse_id}/special-locations")
def get_special_locations(
    warehouse_id: int,
    db: Session = Depends(get_db),
):
    """Return pick_start, packing, and dock locations for the warehouse (id, x, y)."""
    rows = (
        db.query(Location)
        .filter(
            Location.warehouse_id == warehouse_id,
            Location.location_type.in_(["PICK_START", "PACKING", "DOCK"]),
        )
        .all()
    )
    pick_start = None
    packing = None
    dock = None
    for loc in rows:
        d = {"id": loc.id, "x": float(loc.x or 0), "y": float(loc.y or 0)}
        if loc.location_type == "PICK_START":
            pick_start = d
        elif loc.location_type == "PACKING":
            packing = d
        elif loc.location_type == "DOCK":
            dock = d
    return {"pick_start": pick_start, "packing": packing, "dock": dock}


@router.patch("/special-location/{location_id}")
def update_special_location(
    location_id: int,
    body: SpecialLocationUpdate,
    db: Session = Depends(get_db),
):
    """Update special location position by id."""
    loc = db.query(Location).filter(
        Location.id == location_id,
        Location.location_type.in_(["PICK_START", "PACKING", "DOCK"]),
    ).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Special location not found")
    loc.x = body.x
    loc.y = body.y
    db.commit()
    db.refresh(loc)
    return {"id": loc.id, "x": float(loc.x or 0), "y": float(loc.y or 0), "location_type": loc.location_type}


@router.delete("/special-location/{location_id}")
def delete_special_location(
    location_id: int,
    db: Session = Depends(get_db),
):
    """Delete a special location by id."""
    loc = db.query(Location).filter(
        Location.id == location_id,
        Location.location_type.in_(["PICK_START", "PACKING", "DOCK"]),
    ).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Special location not found")
    db.delete(loc)
    db.commit()
    return {"ok": True}
