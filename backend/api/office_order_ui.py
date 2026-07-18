"""
Panel-only order UI statuses (office): CRUD and assignment.

Does not modify Order.status (system / workflow).
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.order_ui_panel_subgroup import OrderUiPanelSubgroup
from ..models.order_ui_status import OrderUiStatus
from ..schemas.order import (
    OrderRead,
    OrderUiPanelSubgroupCreate,
    OrderUiPanelSubgroupRead,
    OrderUiPanelSubgroupReorder,
    OrderUiPanelSubgroupUpdate,
    OrderUiStatusCreate,
    OrderUiStatusPanelSummary,
    OrderUiStatusPatch,
    OrderUiStatusRead,
    OrderUiStatusUpdate,
)
from ..services.order_ui_status_panel import (
    build_order_ui_status_panel_summary,
    build_tenant_order_ui_status_panel_summary,
    norm_order_ui_main_group,
    order_ui_status_row_to_read,
)
from ..services.panel_status_image_upload import save_panel_status_image_bytes
from ..auth.deps import get_optional_current_user
from ..models.app_user import AppUser
from ..services.order_panel_ui_status_service import apply_order_panel_ui_status
from ..services.cart_picking_lifecycle_service import CartLifecycleError
from ..services.order_ui_status_reorder import reindex_order_ui_group
from .order import build_order_read

router = APIRouter(prefix="/office/order-ui", tags=["Office Order UI Statuses"])

logger = logging.getLogger(__name__)


@router.get("/summary", response_model=OrderUiStatusPanelSummary)
def panel_summary(
    tenant_id: int = Query(...),
    warehouse_id: Optional[int] = Query(
        None,
        ge=1,
        description="Opcjonalny magazyn realizacji; bez parametru — suma tenant-wide",
    ),
    include_inactive: bool = Query(False, description="Ustawienia: pokaż także nieaktywne statusy"),
    include_archived_orders: bool = Query(
        False,
        description="Gdy true — liczniki uwzględniają zamówienia zarchiwizowane (deleted_at). Domyślnie wyłączone.",
    ),
    db: Session = Depends(get_db),
):
    try:
        if warehouse_id is None:
            return build_tenant_order_ui_status_panel_summary(
                db,
                tenant_id,
                include_inactive=include_inactive,
                include_archived_orders=include_archived_orders,
            )
        return build_order_ui_status_panel_summary(
            db,
            tenant_id,
            warehouse_id,
            include_inactive=include_inactive,
            include_archived_orders=include_archived_orders,
        )
    except SQLAlchemyError:
        logger.exception("panel_summary: database error (order UI statuses)")
        if warehouse_id is None:
            return build_tenant_order_ui_status_panel_summary(
                db,
                tenant_id,
                include_inactive=include_inactive,
                include_archived_orders=include_archived_orders,
            )
        return build_order_ui_status_panel_summary(
            db,
            tenant_id,
            warehouse_id,
            include_inactive=include_inactive,
            include_archived_orders=include_archived_orders,
        )


@router.post("/rebuild-operational-caches")
def post_rebuild_operational_caches(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """
    Jednorazowa naprawa spójności: usuwa zadania kolejki Braki dla zarchiwizowanych/usuniętych zamówień,
    synchronizuje otwarte zadania z bieżącym stanem realizacji.
    """
    from ..services.order_counters_rebuild_service import rebuild_order_counters_and_wms_queues

    out = rebuild_order_counters_and_wms_queues(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    db.commit()
    return out


@router.post("/statuses", response_model=OrderUiStatusRead)
def create_status(
    body: OrderUiStatusCreate,
    tenant_id: int = Query(...),
    warehouse_id: int = Query(...),
    db: Session = Depends(get_db),
):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    mg = norm_order_ui_main_group(body.main_group)
    try:
        clash = (
            db.query(OrderUiStatus)
            .filter(
                OrderUiStatus.tenant_id == tenant_id,
                OrderUiStatus.warehouse_id == warehouse_id,
                OrderUiStatus.main_group == mg,
                OrderUiStatus.name == name,
            )
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail="status name already exists in this group for this warehouse")
        top = (
            db.query(func.max(OrderUiStatus.sort_status))
            .filter(
                OrderUiStatus.tenant_id == tenant_id,
                OrderUiStatus.warehouse_id == warehouse_id,
                OrderUiStatus.main_group == mg,
            )
            .scalar()
        )
        next_sort = int(top or 0) + 1
        sort_st = int(body.sort_status) if body.sort_status is not None else next_sort
        sort_ord = int(body.sort_order) if body.sort_order is not None else sort_st
        row = OrderUiStatus(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            main_group=mg,
            name=name,
            color=body.color,
            sort_order=sort_ord,
            is_system=False,
            group_name=(body.group_name or "").strip()[:128] or None,
            subgroup_name=(body.subgroup_name or "").strip()[:128] or None,
            sort_group=int(body.sort_group or 0),
            sort_subgroup=int(body.sort_subgroup or 0),
            sort_status=sort_st,
            badge_color=(body.badge_color or None),
            background_color=(body.background_color or None),
            text_color=(body.text_color or None),
            image_url=(body.image_url or "").strip()[:512] or None,
            is_active=bool(body.is_active),
        )
        db.add(row)
        db.flush()
        reindex_order_ui_group(db, tenant_id=tenant_id, warehouse_id=warehouse_id, main_group=mg)
        db.commit()
        db.refresh(row)
        return order_ui_status_row_to_read(row)
    except HTTPException:
        raise
    except SQLAlchemyError:
        logger.exception("create_status: database error")
        raise HTTPException(
            status_code=503,
            detail="Panel order status storage is unavailable (database schema or connection).",
        ) from None


@router.patch("/statuses/{status_id}", response_model=OrderUiStatusRead)
def update_status(
    status_id: int,
    body: OrderUiStatusUpdate,
    tenant_id: int = Query(...),
    warehouse_id: int = Query(...),
    db: Session = Depends(get_db),
):
    row = (
        db.query(OrderUiStatus)
        .filter(
            OrderUiStatus.id == status_id,
            OrderUiStatus.tenant_id == tenant_id,
            OrderUiStatus.warehouse_id == warehouse_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Status not found")
    is_sys = bool(getattr(row, "is_system", False))
    old_mg = norm_order_ui_main_group(row.main_group)
    target_mg = old_mg
    if body.main_group is not None:
        next_mg = norm_order_ui_main_group(body.main_group)
        if is_sys and next_mg != old_mg:
            raise HTTPException(status_code=400, detail="Cannot move system statuses to another group")
        target_mg = next_mg
        row.main_group = target_mg
    if body.name is not None:
        n = body.name.strip()
        if not n:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        clash = (
            db.query(OrderUiStatus)
            .filter(
                OrderUiStatus.tenant_id == tenant_id,
                OrderUiStatus.warehouse_id == warehouse_id,
                OrderUiStatus.main_group == target_mg,
                OrderUiStatus.name == n,
                OrderUiStatus.id != status_id,
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
    sort_changed = False
    if body.sort_order is not None:
        if is_sys:
            raise HTTPException(status_code=400, detail="Use POST /order-substatuses/reorder to change order")
        row.sort_order = int(body.sort_order)
        if hasattr(row, "sort_status"):
            row.sort_status = int(body.sort_order)
        sort_changed = True
    elif body.sort_status is not None:
        if is_sys:
            raise HTTPException(status_code=400, detail="Use POST /order-substatuses/reorder to change order")
        row.sort_status = int(body.sort_status)
        row.sort_order = int(body.sort_status)
        sort_changed = True
    db.commit()
    db.refresh(row)
    new_mg = norm_order_ui_main_group(row.main_group)
    if body.main_group is not None and old_mg != new_mg:
        reindex_order_ui_group(db, tenant_id=tenant_id, warehouse_id=warehouse_id, main_group=old_mg)
        reindex_order_ui_group(db, tenant_id=tenant_id, warehouse_id=warehouse_id, main_group=new_mg)
        db.commit()
        db.refresh(row)
    elif sort_changed:
        reindex_order_ui_group(db, tenant_id=tenant_id, warehouse_id=warehouse_id, main_group=new_mg)
        db.commit()
        db.refresh(row)
    return order_ui_status_row_to_read(row)


@router.post("/statuses/{status_id}/image", response_model=OrderUiStatusRead)
async def upload_status_image(
    status_id: int,
    tenant_id: int = Query(...),
    warehouse_id: int = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    row = (
        db.query(OrderUiStatus)
        .filter(
            OrderUiStatus.id == status_id,
            OrderUiStatus.tenant_id == tenant_id,
            OrderUiStatus.warehouse_id == warehouse_id,
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
    return order_ui_status_row_to_read(row)


@router.delete("/statuses/{status_id}", status_code=204)
def delete_status(
    status_id: int,
    tenant_id: int = Query(...),
    warehouse_id: int = Query(...),
    db: Session = Depends(get_db),
):
    row = (
        db.query(OrderUiStatus)
        .filter(
            OrderUiStatus.id == status_id,
            OrderUiStatus.tenant_id == tenant_id,
            OrderUiStatus.warehouse_id == warehouse_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Status not found")
    if bool(getattr(row, "is_system", False)):
        raise HTTPException(status_code=400, detail="Cannot delete system statuses")
    mg = norm_order_ui_main_group(row.main_group)
    db.delete(row)
    db.commit()
    reindex_order_ui_group(db, tenant_id=tenant_id, warehouse_id=warehouse_id, main_group=mg)
    db.commit()
    return None


def _load_order_for_panel(
    db: Session, order_id: int, tenant_id: int, warehouse_id: int | None = None
) -> Order | None:
    q = (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.order_ui_status),
        )
        .filter(
            Order.id == order_id,
            Order.tenant_id == tenant_id,
        )
    )
    if warehouse_id is not None:
        q = q.filter(Order.warehouse_id == warehouse_id)
    return q.first()


@router.patch("/orders/{order_id}/ui-status", response_model=OrderRead)
def patch_order_ui_status(
    order_id: int,
    body: OrderUiStatusPatch,
    tenant_id: int = Query(...),
    warehouse_id: int | None = Query(
        None,
        description="Opcjonalny; gdy brak — używany jest orders.warehouse_id (operacja workflow).",
    ),
    db: Session = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_optional_current_user),
):
    """Set or clear panel sub-status on an order (does not touch Order.status)."""
    row = _load_order_for_panel(db, order_id, tenant_id, warehouse_id)
    if not row:
        raise HTTPException(status_code=404, detail="Order not found")
    effective_wh = getattr(row, "warehouse_id", None)
    sid = body.sub_status_id
    if sid is not None:
        q_status = db.query(OrderUiStatus).filter(
            OrderUiStatus.id == sid,
            OrderUiStatus.tenant_id == tenant_id,
        )
        if effective_wh is not None:
            q_status = q_status.filter(OrderUiStatus.warehouse_id == int(effective_wh))
        us = q_status.first()
        if not us:
            raise HTTPException(status_code=400, detail="Unknown panel sub-status for this warehouse")
        if not bool(getattr(us, "is_active", True)):
            raise HTTPException(status_code=400, detail="Ten status panelu jest nieaktywny")
    uid = int(current_user.id) if current_user is not None and current_user.id is not None else None
    try:
        apply_order_panel_ui_status(
            db,
            order=row,
            sub_status_id=sid,
            operator_user_id=uid,
        )
    except CartLifecycleError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    db.commit()
    row = _load_order_for_panel(db, order_id, tenant_id, int(effective_wh) if effective_wh is not None else None)
    assert row is not None
    return build_order_read(db, row)


# --- Panel subgroups (dictionary) ---


@router.get("/panel-subgroups", response_model=List[OrderUiPanelSubgroupRead])
def list_panel_subgroups(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(OrderUiPanelSubgroup)
        .filter(
            OrderUiPanelSubgroup.tenant_id == tenant_id,
            OrderUiPanelSubgroup.warehouse_id == warehouse_id,
        )
        .order_by(
            OrderUiPanelSubgroup.main_group.asc(),
            OrderUiPanelSubgroup.sort_order.asc(),
            OrderUiPanelSubgroup.id.asc(),
        )
        .all()
    )
    return [OrderUiPanelSubgroupRead.model_validate(r) for r in rows]


@router.post("/panel-subgroups", response_model=OrderUiPanelSubgroupRead)
def create_panel_subgroup(
    body: OrderUiPanelSubgroupCreate,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    mg = norm_order_ui_main_group(body.main_group)
    clash = (
        db.query(OrderUiPanelSubgroup)
        .filter(
            OrderUiPanelSubgroup.tenant_id == tenant_id,
            OrderUiPanelSubgroup.warehouse_id == warehouse_id,
            OrderUiPanelSubgroup.main_group == mg,
            OrderUiPanelSubgroup.name == name,
        )
        .first()
    )
    if clash:
        raise HTTPException(status_code=400, detail="subgroup name already exists in this main group")
    top = (
        db.query(func.max(OrderUiPanelSubgroup.sort_order))
        .filter(
            OrderUiPanelSubgroup.tenant_id == tenant_id,
            OrderUiPanelSubgroup.warehouse_id == warehouse_id,
            OrderUiPanelSubgroup.main_group == mg,
        )
        .scalar()
    )
    next_sort = int(top or 0) + 1
    row = OrderUiPanelSubgroup(
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        main_group=mg,
        name=name[:128],
        sort_order=next_sort,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return OrderUiPanelSubgroupRead.model_validate(row)


@router.patch("/panel-subgroups/{subgroup_id}", response_model=OrderUiPanelSubgroupRead)
def update_panel_subgroup(
    subgroup_id: int,
    body: OrderUiPanelSubgroupUpdate,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = (
        db.query(OrderUiPanelSubgroup)
        .filter(
            OrderUiPanelSubgroup.id == subgroup_id,
            OrderUiPanelSubgroup.tenant_id == tenant_id,
            OrderUiPanelSubgroup.warehouse_id == warehouse_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Subgroup not found")
    mg = norm_order_ui_main_group(row.main_group)
    old_name = (row.name or "").strip()
    if body.name is not None:
        n = body.name.strip()
        if not n:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        clash = (
            db.query(OrderUiPanelSubgroup)
            .filter(
                OrderUiPanelSubgroup.tenant_id == tenant_id,
                OrderUiPanelSubgroup.warehouse_id == warehouse_id,
                OrderUiPanelSubgroup.main_group == mg,
                OrderUiPanelSubgroup.name == n,
                OrderUiPanelSubgroup.id != subgroup_id,
            )
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail="subgroup name already exists in this main group")
        if n != old_name:
            (
                db.query(OrderUiStatus)
                .filter(
                    OrderUiStatus.tenant_id == tenant_id,
                    OrderUiStatus.warehouse_id == warehouse_id,
                    OrderUiStatus.main_group == mg,
                    OrderUiStatus.subgroup_name == old_name,
                )
                .update({OrderUiStatus.subgroup_name: n[:128]}, synchronize_session=False)
            )
        row.name = n[:128]
    if body.sort_order is not None:
        row.sort_order = int(body.sort_order)
    db.commit()
    db.refresh(row)
    return OrderUiPanelSubgroupRead.model_validate(row)


@router.delete("/panel-subgroups/{subgroup_id}", status_code=204)
def delete_panel_subgroup(
    subgroup_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = (
        db.query(OrderUiPanelSubgroup)
        .filter(
            OrderUiPanelSubgroup.id == subgroup_id,
            OrderUiPanelSubgroup.tenant_id == tenant_id,
            OrderUiPanelSubgroup.warehouse_id == warehouse_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Subgroup not found")
    mg = norm_order_ui_main_group(row.main_group)
    nm = (row.name or "").strip()
    cnt = (
        db.query(func.count(OrderUiStatus.id))
        .filter(
            OrderUiStatus.tenant_id == tenant_id,
            OrderUiStatus.warehouse_id == warehouse_id,
            OrderUiStatus.main_group == mg,
            OrderUiStatus.subgroup_name == nm,
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


@router.post("/panel-subgroups/reorder", response_model=List[OrderUiPanelSubgroupRead])
def reorder_panel_subgroups(
    body: OrderUiPanelSubgroupReorder,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    mg = norm_order_ui_main_group(body.main_group)
    rows = (
        db.query(OrderUiPanelSubgroup)
        .filter(
            OrderUiPanelSubgroup.tenant_id == tenant_id,
            OrderUiPanelSubgroup.warehouse_id == warehouse_id,
            OrderUiPanelSubgroup.main_group == mg,
        )
        .order_by(OrderUiPanelSubgroup.sort_order.asc(), OrderUiPanelSubgroup.id.asc())
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
        return [OrderUiPanelSubgroupRead.model_validate(r) for r in rows]
    rows[idx], rows[j] = rows[j], rows[idx]
    for i, r in enumerate(rows):
        r.sort_order = i
    db.commit()
    refreshed = (
        db.query(OrderUiPanelSubgroup)
        .filter(
            OrderUiPanelSubgroup.tenant_id == tenant_id,
            OrderUiPanelSubgroup.warehouse_id == warehouse_id,
            OrderUiPanelSubgroup.main_group == mg,
        )
        .order_by(OrderUiPanelSubgroup.sort_order.asc(), OrderUiPanelSubgroup.id.asc())
        .all()
    )
    return [OrderUiPanelSubgroupRead.model_validate(r) for r in refreshed]
