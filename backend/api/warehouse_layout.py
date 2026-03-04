from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.warehouse_layout_service import WarehouseLayoutService
from ..schemas.warehouse_layout import WarehouseLayoutPayload

router = APIRouter(prefix="/warehouse", tags=["Warehouse Layout"])


@router.get("/layout")
def get_layout(
    tenant_id: int,
    warehouse_id: int,
    db: Session = Depends(get_db),
):
    service = WarehouseLayoutService(db)
    return service.get_layout(tenant_id, warehouse_id)


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
