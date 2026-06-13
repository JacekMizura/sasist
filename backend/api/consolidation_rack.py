from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.consolidation_rack_service import ConsolidationRackService
from ..schemas.consolidation_rack import (
    ConsolidationRackRead,
    ConsolidationRackCreate,
    ConsolidationRackUpdate,
    RackSegmentUpdate,
    AssignSegmentRequest,
)

router = APIRouter(prefix="/racks", tags=["Consolidation Racks"])


@router.get("/", response_model=List[dict])
def list_racks(
    tenant_id: int,
    warehouse_id: int,
    db: Session = Depends(get_db),
):
    service = ConsolidationRackService(db)
    return service.list_racks(tenant_id, warehouse_id)


@router.get("/{rack_id}/", response_model=dict)
def get_rack(rack_id: int, db: Session = Depends(get_db)):
    service = ConsolidationRackService(db)
    return service.get_rack(rack_id)


@router.post("/", response_model=dict)
def create_rack(
    data: ConsolidationRackCreate,
    db: Session = Depends(get_db),
):
    service = ConsolidationRackService(db)
    levels = [lv.model_dump() for lv in data.levels]
    return service.create_rack(
        data.tenant_id,
        data.warehouse_id,
        data.name,
        levels,
    )


@router.put("/{rack_id}/", response_model=dict)
def update_rack(
    rack_id: int,
    data: ConsolidationRackUpdate,
    db: Session = Depends(get_db),
):
    service = ConsolidationRackService(db)
    return service.update_rack(rack_id, data.name)


@router.delete("/{rack_id}/")
def delete_rack(rack_id: int, db: Session = Depends(get_db)):
    service = ConsolidationRackService(db)
    return service.delete_rack(rack_id)


@router.patch("/segments/{segment_id}/", response_model=dict)
def update_segment(
    segment_id: int,
    data: RackSegmentUpdate,
    db: Session = Depends(get_db),
):
    service = ConsolidationRackService(db)
    fields = data.model_dump(exclude_unset=True)
    unset_slot = False
    slot_label = None
    if "slot_label" in fields:
        raw = fields["slot_label"]
        if raw is None or (isinstance(raw, str) and not str(raw).strip()):
            unset_slot = True
        else:
            slot_label = str(raw)
    return service.update_segment(
        segment_id,
        slot_label=slot_label,
        length_mm=fields.get("length_mm"),
        width_mm=fields.get("width_mm"),
        height_mm=fields.get("height_mm"),
        unset_slot_label=unset_slot,
    )


@router.post("/segments/{segment_id}/assign/")
def assign_segment(
    segment_id: int,
    data: AssignSegmentRequest,
    db: Session = Depends(get_db),
):
    service = ConsolidationRackService(db)
    return service.assign_segment(segment_id, data.order_id, data.fill_percent)


@router.post("/segments/{segment_id}/clear/")
def clear_segment(segment_id: int, db: Session = Depends(get_db)):
    service = ConsolidationRackService(db)
    return service.clear_segment(segment_id)
