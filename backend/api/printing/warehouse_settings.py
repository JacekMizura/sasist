"""Warehouse printing settings API (prefer_sasist_agent flag)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ...auth.deps import get_current_user
from ...database import get_db
from ...models.app_user import AppUser
from ...schemas.printing.warehouse_settings import (
    PrintingWarehouseSettingsRead,
    PrintingWarehouseSettingsUpdate,
)
from ...services.printing.warehouse_settings_service import (
    get_warehouse_printing_settings,
    update_warehouse_printing_settings,
)

router = APIRouter()


@router.get("/warehouse-settings", response_model=PrintingWarehouseSettingsRead)
def read_warehouse_printing_settings(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _user: AppUser = Depends(get_current_user),
):
    return get_warehouse_printing_settings(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id
    )


@router.put("/warehouse-settings", response_model=PrintingWarehouseSettingsRead)
def write_warehouse_printing_settings(
    payload: PrintingWarehouseSettingsUpdate,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _user: AppUser = Depends(get_current_user),
):
    return update_warehouse_printing_settings(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        payload=payload,
    )
