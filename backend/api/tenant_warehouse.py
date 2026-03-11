"""
API: Tenant-Warehouse assignments (many-to-many)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..schemas.tenant_warehouse import TenantWarehouseCreate, TenantWarehouseRead
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
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
