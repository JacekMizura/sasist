"""HTTP API — operational delivery work queue (Kolejność dostaw)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user
from ..auth.warehouse_deps import require_active_or_query_operable_warehouse
from ..database import get_db
from ..models.app_user import AppUser
from ..schemas.delivery_work_queue import (
    DeliveryWorkQueueItemOut,
    DeliveryWorkQueueOut,
    DeliveryWorkQueuePriorityBody,
    DeliveryWorkQueueReorderBody,
)
from ..services.delivery_work_queue_service import (
    DeliveryWorkQueueError,
    list_delivery_work_queue,
    reorder_delivery_work_queue,
    set_delivery_work_queue_priority,
)

router = APIRouter(prefix="/wms/delivery-work-queue", tags=["WMS Delivery Work Queue"])


@router.get("", response_model=DeliveryWorkQueueOut)
def get_delivery_work_queue(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    _user: AppUser = Depends(get_current_user),
):
    return list_delivery_work_queue(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


@router.put("/reorder", response_model=DeliveryWorkQueueOut)
def put_delivery_work_queue_reorder(
    body: DeliveryWorkQueueReorderBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    _user: AppUser = Depends(get_current_user),
):
    try:
        out = reorder_delivery_work_queue(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            ordered_pz_ids=body.ordered_pz_ids,
        )
        db.commit()
        return out
    except DeliveryWorkQueueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/{pz_id}/priority", response_model=DeliveryWorkQueueItemOut)
def patch_delivery_work_queue_priority(
    pz_id: int,
    body: DeliveryWorkQueuePriorityBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    _user: AppUser = Depends(get_current_user),
):
    try:
        item = set_delivery_work_queue_priority(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            pz_id=pz_id,
            priority=body.priority,
        )
        db.commit()
        return item
    except DeliveryWorkQueueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
