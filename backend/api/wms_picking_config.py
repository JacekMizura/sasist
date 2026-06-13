"""
WMS — konfiguracja zbierania (``picking_config``): CRUD.

Brak integracji z przypisaniami / stanem / MM.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from fastapi import Depends
from ..auth.warehouse_deps import (
    require_operable_warehouse,
    require_active_operable_warehouse,
    require_active_or_query_operable_warehouse,
    assert_stock_document_warehouse,
    enforce_warehouse_access,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.picking_config import PickingConfig
from ..schemas.picking_config import (
    PickingConfigCreate,
    PickingConfigListResponse,
    PickingConfigRead,
    PickingConfigUpdate,
)
from ..services.picking_config_query import get_picking_config
from ..services.picking_config_service import (
    create_picking_config,
    list_picking_configs,
    picking_config_to_read,
    update_picking_config,
)

router = APIRouter(prefix="/wms/picking-config", tags=["WMS Picking Config"])


@router.get("", response_model=PickingConfigListResponse)
def get_picking_configs(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    rows = list_picking_configs(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    return PickingConfigListResponse(items=[picking_config_to_read(r) for r in rows])


@router.get("/by-source-status", response_model=PickingConfigRead)
def get_picking_config_by_source_status(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    source_status_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """Jedna konfiguracja dla statusu źródłowego (panel) — pod flow WMS zbieranie."""
    row = get_picking_config(db, tenant_id, warehouse_id, source_status_id)
    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Brak konfiguracji zbierania dla tego statusu.",
        )
    return picking_config_to_read(row)


@router.post("", response_model=PickingConfigRead)
def post_picking_config(body: PickingConfigCreate, db: Session = Depends(get_db)):
    try:
        row = create_picking_config(db, body)
        db.commit()
        db.refresh(row)
        return picking_config_to_read(row)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Konfiguracja dla tego statusu źródłowego już istnieje.",
        ) from e


@router.put("/{config_id}", response_model=PickingConfigRead)
def put_picking_config(
    config_id: int,
    body: PickingConfigUpdate,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    row = (
        db.query(PickingConfig)
        .filter(
            PickingConfig.id == int(config_id),
            PickingConfig.tenant_id == int(tenant_id),
            PickingConfig.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Konfiguracja nie znaleziona.")
    try:
        update_picking_config(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            body=body,
            existing=row,
        )
        db.commit()
        db.refresh(row)
        return picking_config_to_read(row)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.delete("/{config_id}", status_code=204)
def delete_picking_config(
    config_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    row = (
        db.query(PickingConfig)
        .filter(
            PickingConfig.id == int(config_id),
            PickingConfig.tenant_id == int(tenant_id),
            PickingConfig.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Konfiguracja nie znaleziona.")
    db.delete(row)
    db.commit()
