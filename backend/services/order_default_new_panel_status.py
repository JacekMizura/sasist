"""
Centralized default panel (office) sub-status for newly created orders.

Business rule: new orders land on main group NEW with sub-status name "Nowe".
Uses existing custom row if present; otherwise creates one for the warehouse.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models.order import Order
from ..models.order_ui_status import OrderUiStatus

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

MAIN_GROUP_NEW = "NEW"
DEFAULT_SUBSTATUS_NAME = "Nowe"


def get_or_create_default_new_order_ui_status_id(db: Session, tenant_id: int, warehouse_id: int) -> int:
    """
    Resolve ``order_ui_statuses.id`` for subgroup "Nowe" in NEW for this tenant+warehouse.
    Creates a non-system row on demand (unique per group+name).
    """
    tid = int(tenant_id)
    wid = int(warehouse_id)
    row = (
        db.query(OrderUiStatus)
        .filter(
            OrderUiStatus.tenant_id == tid,
            OrderUiStatus.warehouse_id == wid,
            OrderUiStatus.main_group == MAIN_GROUP_NEW,
            OrderUiStatus.name == DEFAULT_SUBSTATUS_NAME,
        )
        .first()
    )
    if row is not None:
        return int(row.id)

    top = (
        db.query(func.max(OrderUiStatus.sort_status))
        .filter(
            OrderUiStatus.tenant_id == tid,
            OrderUiStatus.warehouse_id == wid,
            OrderUiStatus.main_group == MAIN_GROUP_NEW,
        )
        .scalar()
    )
    next_sort = int(top or 0) + 1

    created = OrderUiStatus(
        tenant_id=tid,
        warehouse_id=wid,
        main_group=MAIN_GROUP_NEW,
        name=DEFAULT_SUBSTATUS_NAME,
        color="#64748b",
        sort_order=next_sort,
        is_system=False,
        group_name=None,
        subgroup_name=None,
        sort_group=0,
        sort_subgroup=0,
        sort_status=next_sort,
        is_active=True,
    )
    try:
        with db.begin_nested():
            db.add(created)
            db.flush()
    except IntegrityError:
        db.expire_all()
        again = (
            db.query(OrderUiStatus)
            .filter(
                OrderUiStatus.tenant_id == tid,
                OrderUiStatus.warehouse_id == wid,
                OrderUiStatus.main_group == MAIN_GROUP_NEW,
                OrderUiStatus.name == DEFAULT_SUBSTATUS_NAME,
            )
            .first()
        )
        if again is not None:
            return int(again.id)
        logger.exception("ensure_default_new_order_ui_status: integrity error without existing row")
        raise

    try:
        from .order_ui_status_reorder import reindex_order_ui_group

        reindex_order_ui_group(db, tenant_id=tid, warehouse_id=wid, main_group=MAIN_GROUP_NEW)
    except Exception:
        logger.warning("reindex_order_ui_group after default Nowe failed (non-fatal)", exc_info=True)

    return int(created.id)


def assign_default_new_panel_status_to_order(db: Session, order: Order) -> None:
    """Set ``order_ui_status_id`` to default "Nowe" / NEW (always for new inserts from pipelines)."""
    if order.tenant_id is None or order.warehouse_id is None:
        return
    sid = get_or_create_default_new_order_ui_status_id(db, int(order.tenant_id), int(order.warehouse_id))
    order.order_ui_status_id = sid


def assign_direct_sale_completed_panel_status(
    db: Session,
    order: Order,
    *,
    configured_status_id: int | None = None,
) -> None:
    """Stationary retail: land on completed/DONE panel status, never default NEW."""
    if order.tenant_id is None or order.warehouse_id is None:
        return
    tid = int(order.tenant_id)
    wid = int(order.warehouse_id)
    from .order_status_select_service import (
        resolve_order_status_id_by_legacy_name_hints,
        resolve_order_status_id_with_fallback,
    )

    if configured_status_id is not None and int(configured_status_id) > 0:
        sid = resolve_order_status_id_with_fallback(
            db,
            tenant_id=tid,
            warehouse_id=wid,
            configured_id=int(configured_status_id),
        )
        if sid is not None:
            order.order_ui_status_id = int(sid)
            return
    for legacy_key in ("completed", "paid", "ready"):
        sid = resolve_order_status_id_by_legacy_name_hints(
            db,
            tenant_id=tid,
            warehouse_id=wid,
            legacy_key=legacy_key,
        )
        if sid is not None:
            order.order_ui_status_id = int(sid)
            return
    assign_default_new_panel_status_to_order(db, order)
