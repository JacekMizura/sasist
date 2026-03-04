from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.picking_zone_service import PickingZoneService
from ..schemas.picking_zone import PickingZoneRead, PickingZoneCreate, PickingZoneUpdate

router = APIRouter(prefix="/zones", tags=["Picking Zones"])


@router.get("/", response_model=List[dict])
def list_zones(
    tenant_id: int,
    warehouse_id: int,
    db: Session = Depends(get_db),
):
    service = PickingZoneService(db)
    return service.list_zones(tenant_id, warehouse_id)


@router.post("/", response_model=dict)
def create_zone(
    data: PickingZoneCreate,
    db: Session = Depends(get_db),
):
    service = PickingZoneService(db)
    return service.create_zone(
        data.tenant_id,
        data.warehouse_id,
        data.name,
        data.capacity_volume,
        getattr(data, "length_cm", None),
        getattr(data, "width_cm", None),
        getattr(data, "height_cm", None),
        getattr(data, "max_weight_kg", None),
    )


@router.put("/{zone_id}/", response_model=dict)
def update_zone(
    zone_id: int,
    data: PickingZoneUpdate,
    db: Session = Depends(get_db),
):
    service = PickingZoneService(db)
    return service.update_zone(
        zone_id,
        data.name,
        data.capacity_volume,
        getattr(data, "length_cm", None),
        getattr(data, "width_cm", None),
        getattr(data, "height_cm", None),
        getattr(data, "max_weight_kg", None),
    )


@router.delete("/{zone_id}/")
def delete_zone(zone_id: int, db: Session = Depends(get_db)):
    service = PickingZoneService(db)
    return service.delete_zone(zone_id)


@router.post("/{zone_id}/assign/")
def assign_order(
    zone_id: int,
    order_id: int,
    db: Session = Depends(get_db),
):
    service = PickingZoneService(db)
    return service.assign_order(zone_id, order_id)


@router.post("/{zone_id}/unassign/")
def unassign_order(
    zone_id: int,
    order_id: int,  # query param
    db: Session = Depends(get_db),
):
    service = PickingZoneService(db)
    return service.unassign_order(zone_id, order_id)
