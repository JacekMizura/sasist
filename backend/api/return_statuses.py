"""CRUD for configurable RMZ return statuses per tenant + warehouse."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.return_status import ReturnStatus
from ..models.wms_order_return import WmsOrderReturn
from ..schemas.wms_return import ReturnStatusCreate, ReturnStatusRead, ReturnStatusUpdate

router = APIRouter(prefix="/wms/return-statuses", tags=["WMS Return Statuses"])

_VALID_TYPES = {"in_progress", "done_success", "done_rejected"}


@router.get("", response_model=List[ReturnStatusRead])
def list_return_statuses(
    tenant_id: int = Query(...),
    warehouse_id: int = Query(...),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ReturnStatus)
        .filter(ReturnStatus.tenant_id == tenant_id, ReturnStatus.warehouse_id == warehouse_id)
        .order_by(ReturnStatus.id.asc())
        .all()
    )
    return [
        ReturnStatusRead(
            id=r.id,
            tenant_id=r.tenant_id,
            warehouse_id=r.warehouse_id,
            name=r.name,
            color=r.color,
            type=r.type,  # type: ignore[arg-type]
            transition_key=r.transition_key,
        )
        for r in rows
    ]


@router.post("", response_model=ReturnStatusRead)
def create_return_status(
    body: ReturnStatusCreate,
    tenant_id: int = Query(...),
    warehouse_id: int = Query(...),
    db: Session = Depends(get_db),
):
    if body.type not in _VALID_TYPES:
        raise HTTPException(status_code=400, detail="Invalid type")
    tkey = (body.transition_key or "").strip() or None
    if tkey:
        clash = (
            db.query(ReturnStatus)
            .filter(
                ReturnStatus.tenant_id == tenant_id,
                ReturnStatus.warehouse_id == warehouse_id,
                ReturnStatus.transition_key == tkey,
            )
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail="transition_key already used for this warehouse")

    row = ReturnStatus(
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        name=body.name.strip(),
        color=(body.color or "blue").strip(),
        type=body.type,
        transition_key=tkey,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return ReturnStatusRead(
        id=row.id,
        tenant_id=row.tenant_id,
        warehouse_id=row.warehouse_id,
        name=row.name,
        color=row.color,
        type=row.type,  # type: ignore[arg-type]
        transition_key=row.transition_key,
    )


@router.put("/{status_id}", response_model=ReturnStatusRead)
def update_return_status(
    status_id: int,
    body: ReturnStatusUpdate,
    tenant_id: int = Query(...),
    warehouse_id: int = Query(...),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ReturnStatus)
        .filter(
            ReturnStatus.id == status_id,
            ReturnStatus.tenant_id == tenant_id,
            ReturnStatus.warehouse_id == warehouse_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Status not found")

    if body.name is not None:
        row.name = body.name.strip()
    if body.color is not None:
        row.color = body.color.strip()
    if body.type is not None:
        if body.type not in _VALID_TYPES:
            raise HTTPException(status_code=400, detail="Invalid type")
        row.type = body.type
    if body.transition_key is not None:
        tkey = body.transition_key.strip() or None
        if tkey:
            clash = (
                db.query(ReturnStatus)
                .filter(
                    ReturnStatus.tenant_id == tenant_id,
                    ReturnStatus.warehouse_id == warehouse_id,
                    ReturnStatus.transition_key == tkey,
                    ReturnStatus.id != status_id,
                )
                .first()
            )
            if clash:
                raise HTTPException(status_code=400, detail="transition_key already used")
        row.transition_key = tkey

    db.commit()
    db.refresh(row)
    return ReturnStatusRead(
        id=row.id,
        tenant_id=row.tenant_id,
        warehouse_id=row.warehouse_id,
        name=row.name,
        color=row.color,
        type=row.type,  # type: ignore[arg-type]
        transition_key=row.transition_key,
    )


@router.delete("/{status_id}")
def delete_return_status(
    status_id: int,
    tenant_id: int = Query(...),
    warehouse_id: int = Query(...),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ReturnStatus)
        .filter(
            ReturnStatus.id == status_id,
            ReturnStatus.tenant_id == tenant_id,
            ReturnStatus.warehouse_id == warehouse_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Status not found")

    in_use = (
        db.query(WmsOrderReturn.id)
        .filter(WmsOrderReturn.status_id == status_id, WmsOrderReturn.deleted_at.is_(None))
        .limit(1)
        .first()
    )
    if in_use:
        raise HTTPException(status_code=400, detail="Status is assigned to returns; reassign before delete")

    db.delete(row)
    db.commit()
    return {"ok": True}
