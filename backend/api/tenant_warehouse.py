"""
API: Tenant-Warehouse assignments (many-to-many)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..schemas.tenant_warehouse import TenantWarehouseCreate, TenantWarehouseRead, TenantWarehouseUpdate
from ..services.tenant_warehouse_service import TenantWarehouseService

router = APIRouter(prefix="/tenant-warehouses", tags=["Tenant-Warehouse Assignments"])


@router.get("/", response_model=List[TenantWarehouseRead])
def list_assignments(
    tenant_id: int | None = Query(None, description="Filter by tenant"),
    warehouse_id: int | None = Query(None, description="Filter by warehouse"),
    db: Session = Depends(get_db),
):
    service = TenantWarehouseService(db)
    return service.list_assignments(tenant_id=tenant_id, warehouse_id=warehouse_id)


@router.post("/", response_model=TenantWarehouseRead, status_code=201)
def create_assignment(data: TenantWarehouseCreate, db: Session = Depends(get_db)):
    service = TenantWarehouseService(db)
    try:
        return service.create_assignment(
            tenant_id=data.tenant_id,
            warehouse_id=data.warehouse_id,
            role=data.role,
            is_default=data.is_default,
            participates_in_network_stock=data.participates_in_network_stock,
            fulfillment_eligible=data.fulfillment_eligible,
            fulfillment_priority=data.fulfillment_priority,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{assignment_id}", response_model=TenantWarehouseRead)
def update_assignment(
    assignment_id: int,
    data: TenantWarehouseUpdate,
    db: Session = Depends(get_db),
):
    service = TenantWarehouseService(db)
    payload = data.model_dump(exclude_unset=True)
    if not payload:
        tw = service.get_assignment(assignment_id)
        if not tw:
            raise HTTPException(status_code=404, detail="Assignment not found")
        return tw
    try:
        return service.update_assignment(assignment_id, **payload)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e
