"""
Panel-only complaint UI statuses (office): CRUD and assignment.

Tenant-scoped sub-statuses. Does not add operational workflow fields on Complaint.
"""

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models.complaint import Complaint
from ..models.complaint_line import ComplaintLine
from ..models.complaint_ui_status import ComplaintUiStatus
from ..models.order_item import OrderItem
from ..schemas.complaint import (
    ComplaintRead,
    ComplaintUiPanelGroupBlock,
    ComplaintUiStatusCreate,
    ComplaintUiStatusPanelSummary,
    ComplaintUiStatusRead,
    ComplaintUiStatusUpdate,
    ComplaintUiStatusWithCount,
    ComplaintUiStatusPatch,
)
from ..utils.ui_status_color import normalize_stored_color
from .complaint import build_complaint_read

router = APIRouter(prefix="/office/complaint-ui", tags=["Office Complaint UI Statuses"])

logger = logging.getLogger(__name__)

_GROUP_ORDER: tuple[str, ...] = ("NEW", "IN_PROGRESS", "DONE")
_VALID_GROUP = frozenset(_GROUP_ORDER)


def _norm_group(raw: object) -> str:
    s = str(raw or "NEW").strip().upper()
    return s if s in _VALID_GROUP else "NEW"


def _empty_panel_summary() -> ComplaintUiStatusPanelSummary:
    return ComplaintUiStatusPanelSummary(
        groups=[
            ComplaintUiPanelGroupBlock(main_group="NEW", total_count=0, sub_statuses=[]),  # type: ignore[arg-type]
            ComplaintUiPanelGroupBlock(main_group="IN_PROGRESS", total_count=0, sub_statuses=[]),  # type: ignore[arg-type]
            ComplaintUiPanelGroupBlock(main_group="DONE", total_count=0, sub_statuses=[]),  # type: ignore[arg-type]
        ],
        unassigned_count=0,
    )


def _status_read(row: ComplaintUiStatus) -> ComplaintUiStatusRead:
    return ComplaintUiStatusRead(
        id=row.id,
        tenant_id=row.tenant_id,
        main_group=_norm_group(row.main_group),  # type: ignore[arg-type]
        name=row.name,
        color=normalize_stored_color(row.color),
        sort_order=int(row.sort_order or 0),
    )


def _ensure_default_complaint_ui_statuses(db: Session, tenant_id: int) -> None:
    """Seed English default sub-statuses once per tenant when table is empty."""
    try:
        cnt = db.query(func.count(ComplaintUiStatus.id)).filter(ComplaintUiStatus.tenant_id == tenant_id).scalar() or 0
        if int(cnt) > 0:
            return
        rows = [
            ComplaintUiStatus(
                tenant_id=tenant_id, main_group="NEW", name="New complaint", color="#22c55e", sort_order=0
            ),
            ComplaintUiStatus(
                tenant_id=tenant_id, main_group="IN_PROGRESS", name="Under review", color="#3b82f6", sort_order=0
            ),
            ComplaintUiStatus(
                tenant_id=tenant_id,
                main_group="IN_PROGRESS",
                name="Waiting for customer",
                color="#f59e0b",
                sort_order=1,
            ),
            ComplaintUiStatus(
                tenant_id=tenant_id, main_group="DONE", name="Accepted", color="#10b981", sort_order=0
            ),
            ComplaintUiStatus(
                tenant_id=tenant_id, main_group="DONE", name="Rejected", color="#ef4444", sort_order=1
            ),
        ]
        db.add_all(rows)
        db.commit()
    except SQLAlchemyError:
        logger.exception("_ensure_default_complaint_ui_statuses")
        db.rollback()


@router.get("/summary", response_model=ComplaintUiStatusPanelSummary)
def panel_summary(
    tenant_id: int = Query(...),
    warehouse_id: int = Query(..., description="Count complaints in this warehouse only"),
    db: Session = Depends(get_db),
):
    """Grouped sub-statuses with counts for complaints in the given warehouse."""
    try:
        _ensure_default_complaint_ui_statuses(db, tenant_id)
        statuses = (
            db.query(ComplaintUiStatus)
            .filter(ComplaintUiStatus.tenant_id == tenant_id)
            .order_by(ComplaintUiStatus.main_group.asc(), ComplaintUiStatus.sort_order.asc(), ComplaintUiStatus.id.asc())
            .all()
        )
        counts_rows = (
            db.query(Complaint.complaint_ui_status_id, func.count(Complaint.id))
            .filter(
                Complaint.tenant_id == tenant_id,
                Complaint.warehouse_id == warehouse_id,
                Complaint.complaint_ui_status_id.isnot(None),
                Complaint.deleted_at.is_(None),
            )
            .group_by(Complaint.complaint_ui_status_id)
            .all()
        )
        cnt_map = {int(uid): int(c) for uid, c in counts_rows if uid is not None}

        unassigned = (
            db.query(func.count(Complaint.id))
            .filter(
                Complaint.tenant_id == tenant_id,
                Complaint.warehouse_id == warehouse_id,
                Complaint.complaint_ui_status_id.is_(None),
                Complaint.deleted_at.is_(None),
            )
            .scalar()
            or 0
        )

        by_group: dict[str, List[ComplaintUiStatusWithCount]] = {g: [] for g in _GROUP_ORDER}
        for st in statuses:
            gkey = _norm_group(st.main_group)
            if gkey not in by_group:
                gkey = "NEW"
            sr = _status_read(st)
            by_group[gkey].append(
                ComplaintUiStatusWithCount(
                    id=sr.id,
                    tenant_id=sr.tenant_id,
                    main_group=sr.main_group,
                    name=sr.name,
                    color=sr.color,
                    sort_order=sr.sort_order,
                    count=cnt_map.get(st.id, 0),
                )
            )

        groups_out: List[ComplaintUiPanelGroupBlock] = []
        for gkey in _GROUP_ORDER:
            sub_list = by_group.get(gkey, [])
            total = sum(s.count for s in sub_list)
            groups_out.append(
                ComplaintUiPanelGroupBlock(
                    main_group=gkey,  # type: ignore[arg-type]
                    total_count=total,
                    sub_statuses=sub_list,
                )
            )
        return ComplaintUiStatusPanelSummary(groups=groups_out, unassigned_count=int(unassigned))
    except SQLAlchemyError:
        logger.exception("panel_summary: database error (complaint UI statuses)")
        return _empty_panel_summary()


@router.post("/statuses", response_model=ComplaintUiStatusRead)
def create_status(
    body: ComplaintUiStatusCreate,
    tenant_id: int = Query(...),
    db: Session = Depends(get_db),
):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    mg = _norm_group(body.main_group)
    try:
        clash = (
            db.query(ComplaintUiStatus)
            .filter(
                ComplaintUiStatus.tenant_id == tenant_id,
                ComplaintUiStatus.main_group == mg,
                ComplaintUiStatus.name == name,
            )
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail="status name already exists in this group for this tenant")
        row = ComplaintUiStatus(
            tenant_id=tenant_id,
            main_group=mg,
            name=name,
            color=body.color,
            sort_order=int(body.sort_order or 0),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return _status_read(row)
    except HTTPException:
        raise
    except SQLAlchemyError:
        logger.exception("create_status: database error")
        raise HTTPException(
            status_code=503,
            detail="Complaint panel status storage is unavailable (database schema or connection).",
        ) from None


@router.patch("/statuses/{status_id}", response_model=ComplaintUiStatusRead)
def update_status(
    status_id: int,
    body: ComplaintUiStatusUpdate,
    tenant_id: int = Query(...),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ComplaintUiStatus)
        .filter(ComplaintUiStatus.id == status_id, ComplaintUiStatus.tenant_id == tenant_id)
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
            db.query(ComplaintUiStatus)
            .filter(
                ComplaintUiStatus.tenant_id == tenant_id,
                ComplaintUiStatus.main_group == target_mg,
                ComplaintUiStatus.name == n,
                ComplaintUiStatus.id != status_id,
            )
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail="status name already exists in this group for this tenant")
        row.name = n
    if body.color is not None:
        row.color = body.color
    if body.sort_order is not None:
        row.sort_order = int(body.sort_order)
    db.commit()
    db.refresh(row)
    return _status_read(row)


@router.delete("/statuses/{status_id}", status_code=204)
def delete_status(
    status_id: int,
    tenant_id: int = Query(...),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ComplaintUiStatus)
        .filter(ComplaintUiStatus.id == status_id, ComplaintUiStatus.tenant_id == tenant_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Status not found")
    db.delete(row)
    db.commit()
    return None


def _load_complaint_for_panel(
    db: Session, complaint_id: int, tenant_id: int, warehouse_id: int
) -> Complaint | None:
    return (
        db.query(Complaint)
        .options(
            joinedload(Complaint.complaint_ui_status),
            joinedload(Complaint.order),
            joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
        )
        .filter(
            Complaint.id == complaint_id,
            Complaint.tenant_id == tenant_id,
            Complaint.warehouse_id == warehouse_id,
            Complaint.deleted_at.is_(None),
        )
        .first()
    )


@router.patch("/complaints/{complaint_id}/ui-status", response_model=ComplaintRead)
def patch_complaint_ui_status(
    complaint_id: int,
    body: ComplaintUiStatusPatch,
    tenant_id: int = Query(...),
    warehouse_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Set or clear panel sub-status on a complaint."""
    row = _load_complaint_for_panel(db, complaint_id, tenant_id, warehouse_id)
    if not row:
        raise HTTPException(status_code=404, detail="Complaint not found")
    sid = body.sub_status_id
    if sid is not None:
        us = (
            db.query(ComplaintUiStatus)
            .filter(ComplaintUiStatus.id == sid, ComplaintUiStatus.tenant_id == tenant_id)
            .first()
        )
        if not us:
            raise HTTPException(status_code=400, detail="Unknown panel sub-status for this tenant")
    row.complaint_ui_status_id = sid
    db.commit()
    row = _load_complaint_for_panel(db, complaint_id, tenant_id, warehouse_id)
    assert row is not None
    return build_complaint_read(db, row)
