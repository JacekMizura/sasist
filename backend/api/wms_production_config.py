"""
WMS — konfiguracje produkcji: CRUD.

Semantyczne API nad storage ``picking_config`` (``is_production_mode=True``).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth.warehouse_deps import require_operable_warehouse
from ..database import get_db
from ..schemas.production_config import (
    ProductionConfigCreate,
    ProductionConfigListResponse,
    ProductionConfigRead,
    ProductionConfigUpdate,
)
from ..services.production_config_query import (
    get_production_config_by_id,
    list_production_configs,
)
from ..services.production_config_service import (
    create_production_config,
    delete_or_disable_production_config,
    disable_production_config,
    production_config_to_read,
    update_production_config,
)

router = APIRouter(prefix="/wms/settings/production-configs", tags=["WMS Production Config"])


@router.get("", response_model=ProductionConfigListResponse)
def get_production_configs(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    include_inactive: bool = Query(True),
    db: Session = Depends(get_db),
):
    rows = list_production_configs(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        include_inactive=include_inactive,
    )
    return ProductionConfigListResponse(items=[production_config_to_read(r) for r in rows])


@router.get("/{config_id}", response_model=ProductionConfigRead)
def get_production_config(
    config_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    row = get_production_config_by_id(db, int(config_id), require_active=False)
    if (
        row is None
        or int(row.tenant_id) != int(tenant_id)
        or int(row.warehouse_id) != int(warehouse_id)
    ):
        raise HTTPException(status_code=404, detail="Konfiguracja produkcji nie znaleziona.")
    return production_config_to_read(row)


@router.post("", response_model=ProductionConfigRead)
def post_production_config(body: ProductionConfigCreate, db: Session = Depends(get_db)):
    try:
        row = create_production_config(db, body)
        db.commit()
        db.refresh(row)
        return production_config_to_read(row)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Konfiguracja dla tego statusu wejściowego już istnieje.",
        ) from e


@router.put("/{config_id}", response_model=ProductionConfigRead)
def put_production_config(
    config_id: int,
    body: ProductionConfigUpdate,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    row = get_production_config_by_id(db, int(config_id), require_active=False)
    if (
        row is None
        or int(row.tenant_id) != int(tenant_id)
        or int(row.warehouse_id) != int(warehouse_id)
    ):
        raise HTTPException(status_code=404, detail="Konfiguracja produkcji nie znaleziona.")
    try:
        updated = update_production_config(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            existing=row,
            body=body,
        )
        db.commit()
        db.refresh(updated)
        return production_config_to_read(updated)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/{config_id}/disable", response_model=ProductionConfigRead)
def post_disable_production_config(
    config_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    row = get_production_config_by_id(db, int(config_id), require_active=False)
    if (
        row is None
        or int(row.tenant_id) != int(tenant_id)
        or int(row.warehouse_id) != int(warehouse_id)
    ):
        raise HTTPException(status_code=404, detail="Konfiguracja produkcji nie znaleziona.")
    try:
        updated = disable_production_config(db, row)
        db.commit()
        db.refresh(updated)
        return production_config_to_read(updated)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.delete("/{config_id}")
def delete_production_config(
    config_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    row = get_production_config_by_id(db, int(config_id), require_active=False)
    if (
        row is None
        or int(row.tenant_id) != int(tenant_id)
        or int(row.warehouse_id) != int(warehouse_id)
    ):
        raise HTTPException(status_code=404, detail="Konfiguracja produkcji nie znaleziona.")
    try:
        action = delete_or_disable_production_config(db, row)
        db.commit()
        return {"ok": True, "action": action}
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
