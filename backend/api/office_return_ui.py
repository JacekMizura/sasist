"""
Panel-only return UI statuses (office): CRUD and RMZ assignment.

Does not modify ReturnStatus / WMS workflow transitions.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.return_ui_panel_subgroup import ReturnUiPanelSubgroup
from ..models.return_ui_status import ReturnUiStatus
from ..schemas.wms_return import (
    ReturnUiPanelSubgroupCreate,
    ReturnUiPanelSubgroupRead,
    ReturnUiPanelSubgroupReorder,
    ReturnUiPanelSubgroupUpdate,
    ReturnUiStatusCreate,
    ReturnUiStatusPanelSummary,
    ReturnUiStatusRead,
    ReturnUiStatusUpdate,
    WmsReturnRead,
    WmsReturnUiStatusPatch,
)
from ..services.panel_status_image_upload import save_panel_status_image_bytes
from ..services.return_ui_status_panel import (
    build_return_ui_status_panel_summary,
    norm_return_ui_main_group,
    return_ui_status_row_to_read,
)
from ..services.tenant_default_warehouse import ERR_NO_WAREHOUSE, resolve_tenant_default_warehouse_id
from .wms_returns import _load_rmz, _serialize_return_read

router = APIRouter(prefix="/office/return-ui", tags=["Office Return UI Statuses"])

logger = logging.getLogger(__name__)

_norm_group = norm_return_ui_main_group


def office_return_ui_warehouse_id(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
) -> int:
    if warehouse_id is not None:
        return warehouse_id
    try:
        return resolve_tenant_default_warehouse_id(db, tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=ERR_NO_WAREHOUSE) from None


@router.get("/summary", response_model=ReturnUiStatusPanelSummary)
def panel_summary(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(office_return_ui_warehouse_id),
    include_inactive: bool = Query(False, description="Ustawienia: pokaż także nieaktywne statusy"),
    db: Session = Depends(get_db),
):
    """Grouped sub-statuses with counts + unassigned returns (no sub-status)."""
    try:
        return build_return_ui_status_panel_summary(db, tenant_id, warehouse_id, include_inactive=include_inactive)
    except SQLAlchemyError:
        logger.exception("panel_summary: database error (return UI statuses)")
        return build_return_ui_status_panel_summary(db, tenant_id, warehouse_id, include_inactive=include_inactive)


@router.post("/statuses", response_model=ReturnUiStatusRead)
def create_status(
    body: ReturnUiStatusCreate,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(office_return_ui_warehouse_id),
    db: Session = Depends(get_db),
):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    mg = _norm_group(body.main_group)
    try:
        clash = (
            db.query(ReturnUiStatus)
            .filter(
                ReturnUiStatus.tenant_id == tenant_id,
                ReturnUiStatus.warehouse_id == warehouse_id,
                ReturnUiStatus.main_group == mg,
                ReturnUiStatus.name == name,
            )
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail="status name already exists in this group for this warehouse")
        top = (
            db.query(func.max(ReturnUiStatus.sort_status))
            .filter(
                ReturnUiStatus.tenant_id == tenant_id,
                ReturnUiStatus.warehouse_id == warehouse_id,
                ReturnUiStatus.main_group == mg,
            )
            .scalar()
        )
        next_sort = int(top or 0) + 1
        sort_st = int(body.sort_status) if body.sort_status is not None else next_sort
        sort_ord = int(body.sort_order) if body.sort_order is not None else sort_st
        row = ReturnUiStatus(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            main_group=mg,
            name=name,
            color=body.color,
            sort_order=sort_ord,
            group_name=(body.group_name or "").strip()[:128] or None,
            subgroup_name=(body.subgroup_name or "").strip()[:128] or None,
            sort_group=int(body.sort_group or 0),
            sort_subgroup=int(body.sort_subgroup or 0),
            sort_status=sort_st,
            badge_color=body.badge_color or None,
            background_color=body.background_color or None,
            text_color=body.text_color or None,
            image_url=(body.image_url or "").strip()[:512] or None,
            is_active=bool(body.is_active),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return return_ui_status_row_to_read(row)
    except HTTPException:
        raise
    except SQLAlchemyError:
        logger.exception("create_status: database error")
        raise HTTPException(
            status_code=503,
            detail="Panel status storage is unavailable (database schema or connection).",
        ) from None


@router.patch("/statuses/{status_id}", response_model=ReturnUiStatusRead)
def update_status(
    status_id: int,
    body: ReturnUiStatusUpdate,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(office_return_ui_warehouse_id),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ReturnUiStatus)
        .filter(
            ReturnUiStatus.id == status_id,
            ReturnUiStatus.tenant_id == tenant_id,
            ReturnUiStatus.warehouse_id == warehouse_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Status not found")
    target_mg = _norm_group(row.main_group)
    if body.main_group is not None:
        target_mg = _norm_group(body.main_group)
        row.main_group = target_mg
    if body.name is not None:
        n = body.name.strip()
        if not n:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        clash = (
            db.query(ReturnUiStatus)
            .filter(
                ReturnUiStatus.tenant_id == tenant_id,
                ReturnUiStatus.warehouse_id == warehouse_id,
                ReturnUiStatus.main_group == target_mg,
                ReturnUiStatus.name == n,
                ReturnUiStatus.id != status_id,
            )
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail="status name already exists in this group for this warehouse")
        row.name = n
    if body.color is not None:
        row.color = body.color
    if body.group_name is not None:
        row.group_name = body.group_name.strip()[:128] or None
    if body.subgroup_name is not None:
        row.subgroup_name = body.subgroup_name.strip()[:128] or None
    if body.sort_group is not None:
        row.sort_group = int(body.sort_group)
    if body.sort_subgroup is not None:
        row.sort_subgroup = int(body.sort_subgroup)
    if body.badge_color is not None:
        row.badge_color = body.badge_color or None
    if body.background_color is not None:
        row.background_color = body.background_color or None
    if body.text_color is not None:
        row.text_color = body.text_color or None
    if body.image_url is not None:
        row.image_url = body.image_url.strip()[:512] or None
    if body.is_active is not None:
        row.is_active = bool(body.is_active)
    if body.sort_order is not None:
        row.sort_order = int(body.sort_order)
        if hasattr(row, "sort_status"):
            row.sort_status = int(body.sort_order)
    elif body.sort_status is not None:
        row.sort_status = int(body.sort_status)
        row.sort_order = int(body.sort_status)
    db.commit()
    db.refresh(row)
    return return_ui_status_row_to_read(row)


@router.post("/statuses/{status_id}/image", response_model=ReturnUiStatusRead)
async def upload_return_ui_status_image(
    status_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(office_return_ui_warehouse_id),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ReturnUiStatus)
        .filter(
            ReturnUiStatus.id == status_id,
            ReturnUiStatus.tenant_id == tenant_id,
            ReturnUiStatus.warehouse_id == warehouse_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Status not found")
    raw = await file.read()
    url = save_panel_status_image_bytes(raw, file.content_type or "image/png")
    row.image_url = url
    db.commit()
    db.refresh(row)
    return return_ui_status_row_to_read(row)


@router.delete("/statuses/{status_id}", status_code=204)
def delete_status(
    status_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(office_return_ui_warehouse_id),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ReturnUiStatus)
        .filter(
            ReturnUiStatus.id == status_id,
            ReturnUiStatus.tenant_id == tenant_id,
            ReturnUiStatus.warehouse_id == warehouse_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Status not found")
    db.delete(row)
    db.commit()
    return None


@router.patch("/returns/{rmz_id}/ui-status", response_model=WmsReturnRead)
def patch_return_ui_status(
    rmz_id: int,
    body: WmsReturnUiStatusPatch,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(office_return_ui_warehouse_id),
    db: Session = Depends(get_db),
):
    """Set or clear panel sub-status on an RMZ (does not touch ReturnStatus)."""
    row = _load_rmz(db, rmz_id, tenant_id, warehouse_id)
    if not row:
        raise HTTPException(status_code=404, detail="Return not found")
    sid = body.sub_status_id
    if sid is not None:
        us = (
            db.query(ReturnUiStatus)
            .filter(
                ReturnUiStatus.id == sid,
                ReturnUiStatus.tenant_id == tenant_id,
                ReturnUiStatus.warehouse_id == warehouse_id,
            )
            .first()
        )
        if not us:
            raise HTTPException(status_code=400, detail="Unknown panel sub-status for this warehouse")
        if not bool(getattr(us, "is_active", True)):
            raise HTTPException(status_code=400, detail="Ten status panelu jest nieaktywny")
    row.ui_status_id = sid
    db.commit()
    row = _load_rmz(db, rmz_id, tenant_id, warehouse_id)
    assert row is not None
    return _serialize_return_read(db, row)


# --- Panel subgroups ---


@router.get("/panel-subgroups", response_model=List[ReturnUiPanelSubgroupRead])
def list_return_panel_subgroups(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(office_return_ui_warehouse_id),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ReturnUiPanelSubgroup)
        .filter(
            ReturnUiPanelSubgroup.tenant_id == tenant_id,
            ReturnUiPanelSubgroup.warehouse_id == warehouse_id,
        )
        .order_by(
            ReturnUiPanelSubgroup.main_group.asc(),
            ReturnUiPanelSubgroup.sort_order.asc(),
            ReturnUiPanelSubgroup.id.asc(),
        )
        .all()
    )
    return [ReturnUiPanelSubgroupRead.model_validate(r) for r in rows]


@router.post("/panel-subgroups", response_model=ReturnUiPanelSubgroupRead)
def create_return_panel_subgroup(
    body: ReturnUiPanelSubgroupCreate,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(office_return_ui_warehouse_id),
    db: Session = Depends(get_db),
):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    mg = _norm_group(body.main_group)
    clash = (
        db.query(ReturnUiPanelSubgroup)
        .filter(
            ReturnUiPanelSubgroup.tenant_id == tenant_id,
            ReturnUiPanelSubgroup.warehouse_id == warehouse_id,
            ReturnUiPanelSubgroup.main_group == mg,
            ReturnUiPanelSubgroup.name == name,
        )
        .first()
    )
    if clash:
        raise HTTPException(status_code=400, detail="subgroup name already exists in this main group")
    top = (
        db.query(func.max(ReturnUiPanelSubgroup.sort_order))
        .filter(
            ReturnUiPanelSubgroup.tenant_id == tenant_id,
            ReturnUiPanelSubgroup.warehouse_id == warehouse_id,
            ReturnUiPanelSubgroup.main_group == mg,
        )
        .scalar()
    )
    next_sort = int(top or 0) + 1
    row = ReturnUiPanelSubgroup(
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        main_group=mg,
        name=name[:128],
        sort_order=next_sort,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return ReturnUiPanelSubgroupRead.model_validate(row)


@router.patch("/panel-subgroups/{subgroup_id}", response_model=ReturnUiPanelSubgroupRead)
def update_return_panel_subgroup(
    subgroup_id: int,
    body: ReturnUiPanelSubgroupUpdate,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(office_return_ui_warehouse_id),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ReturnUiPanelSubgroup)
        .filter(
            ReturnUiPanelSubgroup.id == subgroup_id,
            ReturnUiPanelSubgroup.tenant_id == tenant_id,
            ReturnUiPanelSubgroup.warehouse_id == warehouse_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Subgroup not found")
    mg = _norm_group(row.main_group)
    old_name = (row.name or "").strip()
    if body.name is not None:
        n = body.name.strip()
        if not n:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        clash = (
            db.query(ReturnUiPanelSubgroup)
            .filter(
                ReturnUiPanelSubgroup.tenant_id == tenant_id,
                ReturnUiPanelSubgroup.warehouse_id == warehouse_id,
                ReturnUiPanelSubgroup.main_group == mg,
                ReturnUiPanelSubgroup.name == n,
                ReturnUiPanelSubgroup.id != subgroup_id,
            )
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail="subgroup name already exists in this main group")
        if n != old_name:
            (
                db.query(ReturnUiStatus)
                .filter(
                    ReturnUiStatus.tenant_id == tenant_id,
                    ReturnUiStatus.warehouse_id == warehouse_id,
                    ReturnUiStatus.main_group == mg,
                    ReturnUiStatus.subgroup_name == old_name,
                )
                .update({ReturnUiStatus.subgroup_name: n[:128]}, synchronize_session=False)
            )
        row.name = n[:128]
    if body.sort_order is not None:
        row.sort_order = int(body.sort_order)
    db.commit()
    db.refresh(row)
    return ReturnUiPanelSubgroupRead.model_validate(row)


@router.delete("/panel-subgroups/{subgroup_id}", status_code=204)
def delete_return_panel_subgroup(
    subgroup_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(office_return_ui_warehouse_id),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ReturnUiPanelSubgroup)
        .filter(
            ReturnUiPanelSubgroup.id == subgroup_id,
            ReturnUiPanelSubgroup.tenant_id == tenant_id,
            ReturnUiPanelSubgroup.warehouse_id == warehouse_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Subgroup not found")
    mg = _norm_group(row.main_group)
    nm = (row.name or "").strip()
    cnt = (
        db.query(func.count(ReturnUiStatus.id))
        .filter(
            ReturnUiStatus.tenant_id == tenant_id,
            ReturnUiStatus.warehouse_id == warehouse_id,
            ReturnUiStatus.main_group == mg,
            ReturnUiStatus.subgroup_name == nm,
        )
        .scalar()
        or 0
    )
    if int(cnt) > 0:
        raise HTTPException(
            status_code=409,
            detail="Subgroup is in use by panel statuses — clear or reassign statuses first",
        )
    db.delete(row)
    db.commit()
    return None


@router.post("/panel-subgroups/reorder", response_model=List[ReturnUiPanelSubgroupRead])
def reorder_return_panel_subgroups(
    body: ReturnUiPanelSubgroupReorder,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(office_return_ui_warehouse_id),
    db: Session = Depends(get_db),
):
    mg = _norm_group(body.main_group)
    rows = (
        db.query(ReturnUiPanelSubgroup)
        .filter(
            ReturnUiPanelSubgroup.tenant_id == tenant_id,
            ReturnUiPanelSubgroup.warehouse_id == warehouse_id,
            ReturnUiPanelSubgroup.main_group == mg,
        )
        .order_by(ReturnUiPanelSubgroup.sort_order.asc(), ReturnUiPanelSubgroup.id.asc())
        .all()
    )
    by_id = {int(r.id): r for r in rows}
    sid = int(body.subgroup_id)
    if sid not in by_id:
        raise HTTPException(status_code=404, detail="Subgroup not in this group")
    idx = next((i for i, r in enumerate(rows) if int(r.id) == sid), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Subgroup not found")
    j = idx - 1 if body.direction == "up" else idx + 1
    if j < 0 or j >= len(rows):
        db.commit()
        return [ReturnUiPanelSubgroupRead.model_validate(r) for r in rows]
    rows[idx], rows[j] = rows[j], rows[idx]
    for i, r in enumerate(rows):
        r.sort_order = i
    db.commit()
    refreshed = (
        db.query(ReturnUiPanelSubgroup)
        .filter(
            ReturnUiPanelSubgroup.tenant_id == tenant_id,
            ReturnUiPanelSubgroup.warehouse_id == warehouse_id,
            ReturnUiPanelSubgroup.main_group == mg,
        )
        .order_by(ReturnUiPanelSubgroup.sort_order.asc(), ReturnUiPanelSubgroup.id.asc())
        .all()
    )
    return [ReturnUiPanelSubgroupRead.model_validate(r) for r in refreshed]
