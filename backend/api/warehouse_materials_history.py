"""Packaging materials catalog — document movement history (Inventory SSOT projection)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user
from ..auth.warehouse_deps import require_active_or_query_operable_warehouse
from ..database import get_db
from ..models.app_user import AppUser
from ..services.packaging_materials.movement_history_service import list_packaging_stock_movements

router = APIRouter(prefix="/warehouse-materials", tags=["Warehouse materials — history"])


class PackagingMovementRead(BaseModel):
    id: str
    occurred_at: datetime
    movement_type: str = Field(description="PZ | RW | MM | KOREKTA | …")
    document_type: str = ""
    document_number: Optional[str] = None
    document_id: Optional[int] = None
    wm_kind: str
    wm_id: Optional[str] = None
    material_name: str
    sku: Optional[str] = None
    qty: float
    warehouse_id: Optional[int] = None
    reference: Optional[str] = None
    notes: Optional[str] = None


@router.get("/movements", response_model=list[PackagingMovementRead])
def list_warehouse_materials_movements(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    movement_type: Optional[str] = Query(None, description="Filter: PZ, RW, MM, KOREKTA"),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    """Historia ruchów Carton / PackagingMaterial z StockDocument + StockOperation."""
    _ = user
    rows = list_packaging_stock_movements(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id) if warehouse_id is not None else None,
        movement_type=movement_type,
        limit=limit,
    )
    return [
        PackagingMovementRead(
            id=r.id,
            occurred_at=r.occurred_at,
            movement_type=r.movement_type,
            document_type=r.document_type,
            document_number=r.document_number,
            document_id=r.document_id,
            wm_kind=r.wm_kind,
            wm_id=r.wm_id,
            material_name=r.material_name,
            sku=r.sku,
            qty=r.qty,
            warehouse_id=r.warehouse_id,
            reference=r.reference,
            notes=r.notes,
        )
        for r in rows
    ]
