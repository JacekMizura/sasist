"""
API: Warehouse

Endpointy w kontekście Tenanta.
Architektura SaaS.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..schemas.warehouse import WarehouseCreate, WarehouseRead
from ..services.warehouse_service import WarehouseService


router = APIRouter(
    prefix="/tenants/{tenant_id}/warehouses",
    tags=["Warehouses"]
)


@router.post("/", response_model=WarehouseRead)
def create_warehouse(
    tenant_id: int,
    data: WarehouseCreate,
    db: Session = Depends(get_db)
):
    service = WarehouseService(db)
    return service.create_warehouse(tenant_id, data.name)


@router.get("/", response_model=List[WarehouseRead])
def get_warehouses(
    tenant_id: int,
    db: Session = Depends(get_db)
):
    service = WarehouseService(db)
    return service.get_warehouses(tenant_id)
