import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth.warehouse_deps import require_operable_warehouse
from ..database import get_db
from ..schemas.structure_report_pdf import StructureReportPdfRequest
from ..schemas.warehouse_layout import WarehouseLayoutPayload
from ..services.special_placement_service import (
    delete_special_placement,
    list_special_placements_payload,
    placement_to_dict,
    update_special_placement_coords,
    upsert_special_placement,
)
from ..services.structure_report_pdf_service import generate_structure_report_pdf_bytes
from ..services.warehouse_layout_service import WarehouseLayoutService
from ..services.warehouse_occupancy_service import get_occupancy_metrics

router = APIRouter(prefix="/warehouse", tags=["Warehouse Layout"])

logger = logging.getLogger(__name__)


class SpecialLocationCreate(BaseModel):
    warehouse_id: int
    x: float
    y: float
    type: Literal["PICK_START", "PACKING", "DOCK"]
    rotation: float = 0.0


class SpecialLocationUpdate(BaseModel):
    x: float
    y: float
    rotation: float | None = None


def _pdf_response(pdf_bytes: bytes, filename: str) -> Response:
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _get_special_locations_payload(db: Session, warehouse_id: int) -> dict:
    """Map markers from warehouse_special_placements (not locations)."""
    return list_special_placements_payload(db, warehouse_id)


@router.get("/layout")
def get_layout(
    tenant_id: int,
    warehouse_id: int,
    db: Session = Depends(get_db),
):
    service = WarehouseLayoutService(db)
    return {
        "layout": service.get_layout(tenant_id, warehouse_id),
        "special_locations": _get_special_locations_payload(db, warehouse_id),
    }


@router.post("/structure-report-pdf")
def structure_report_pdf(
    tenant_id: int,
    warehouse_id: int,
    body: StructureReportPdfRequest,
):
    """
    Raport struktury magazynu (HTML → PDF przez Puppeteer).
    Ciało żądania: ten sam obiekt co `buildWarehouseStructurePdfPayload` na froncie.
    """
    try:
        pdf_bytes = generate_structure_report_pdf_bytes(body.model_dump())
        return _pdf_response(pdf_bytes, f"raport-struktury-magazynu-{warehouse_id}.pdf")
    except Exception as e:
        logger.exception("Structure report PDF generation failed")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/occupancy-metrics")
def warehouse_occupancy_metrics(
    tenant_id: int,
    warehouse_id: int,
    db: Session = Depends(get_db),
):
    """
    Wolumen zajęty: tylko inventory w slotach aktywnego layoutu (UUID binów), produkty bez ``deleted_at``.
    Liczniki typów = sloty layoutu (nie wiersze ``locations``). Pole ``layout_capacity_volume_dm3`` — suma ``Bin.volume_dm3``.
    """
    return get_occupancy_metrics(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


@router.post("/occupancy-metrics/rebuild")
def warehouse_occupancy_metrics_rebuild(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    """To samo co GET — brak osobnej tabeli cache; endpoint pod integracje / „wymuś odświeżenie”."""
    return get_occupancy_metrics(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


@router.get("/layout/labels")
def get_location_labels(
    tenant_id: int,
    warehouse_id: int,
    template_id: int | None = None,
    exclude_floors: list[str] | None = Query(
        None, description="Exclude locations on these floors (repeat param)"
    ),
    db: Session = Depends(get_db),
):
    """Generate location labels PDF using the label template system. Use default location template if template_id not provided."""
    try:
        service = WarehouseLayoutService(db)
        pdf_bytes = service.get_location_labels_pdf(
            tenant_id,
            warehouse_id,
            template_id=template_id,
            exclude_floors=exclude_floors,
        )
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


class RebuildPreflightRequest(BaseModel):
    location_uuids: list[str] = []


@router.post("/layout/rebuild-preflight")
def rebuild_preflight(
    tenant_id: int,
    warehouse_id: int,
    body: RebuildPreflightRequest,
    db: Session = Depends(get_db),
):
    """
    Gates for structure rebuild preview (stock is resolved on FE from inventory;
    this endpoint returns active WMS operations on candidate removals).
    """
    from ..services.warehouse_layout.structure_rebuild_gates import find_active_ops_for_location_uuids

    ops = find_active_ops_for_location_uuids(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        location_uuids=list(body.location_uuids or []),
    )
    return {
        "blocked": len(ops) > 0,
        "active_operations": [op.as_dict() for op in ops],
    }


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
    Upsert map placement (PICK_START | PACKING | DOCK).
    Creates/links operational ``locations`` row but never deletes locations.
    """
    placement = upsert_special_placement(
        db,
        warehouse_id=body.warehouse_id,
        role=body.type,
        x_cm=body.x,
        y_cm=body.y,
        rotation=body.rotation,
    )
    return placement_to_dict(placement)


@router.get("/{warehouse_id}/special-locations")
def get_special_locations(
    warehouse_id: int,
    db: Session = Depends(get_db),
):
    """Return pick_start, packing, and dock map placements (id = placement id, x/y in cm)."""
    return _get_special_locations_payload(db, warehouse_id)


@router.put("/special-location/{placement_id}")
@router.patch("/special-location/{placement_id}")
def update_special_location(
    placement_id: int,
    body: SpecialLocationUpdate,
    db: Session = Depends(get_db),
):
    """Update placement coordinates only — does not touch locations."""
    placement = update_special_placement_coords(
        db,
        placement_id,
        x_cm=body.x,
        y_cm=body.y,
        rotation=body.rotation,
    )
    if not placement:
        raise HTTPException(status_code=404, detail="Special placement not found")
    return placement_to_dict(placement)


@router.delete("/special-location/{placement_id}")
def delete_special_location(
    placement_id: int,
    db: Session = Depends(get_db),
):
    """Remove map placement only. Never deletes the linked locations row or document history."""
    ok = delete_special_placement(db, placement_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Special placement not found")
    return {"ok": True}
