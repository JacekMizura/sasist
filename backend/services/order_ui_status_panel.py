"""Build office order panel UI status summary (shared by summary + reorder endpoints)."""

from __future__ import annotations

import logging
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..models.order import Order
from ..models.order_ui_status import OrderUiStatus
from ..models.picking_config import PickingConfig
from ..schemas.order import (
    OrderUiPanelGroupBlock,
    OrderUiStatusPanelSummary,
    OrderUiStatusRead,
    OrderUiStatusWithCount,
)
from ..utils.panel_ui_status_tokens import resolve_panel_status_tokens
from ..utils.ui_status_color import normalize_stored_color

logger = logging.getLogger(__name__)

_GROUP_ORDER: tuple[str, ...] = ("NEW", "IN_PROGRESS", "DONE")
_VALID_GROUP = frozenset(_GROUP_ORDER)


def norm_order_ui_main_group(raw: object) -> str:
    s = str(raw or "NEW").strip().upper()
    return s if s in _VALID_GROUP else "NEW"


def order_ui_status_row_to_read(row: OrderUiStatus) -> OrderUiStatusRead:
    _, badge, bg, tx = resolve_panel_status_tokens(row)
    gn = getattr(row, "group_name", None)
    sn = getattr(row, "subgroup_name", None)
    img = getattr(row, "image_url", None)
    return OrderUiStatusRead(
        id=row.id,
        tenant_id=row.tenant_id,
        warehouse_id=row.warehouse_id,
        main_group=norm_order_ui_main_group(row.main_group),  # type: ignore[arg-type]
        name=row.name,
        color=normalize_stored_color(row.color),
        sort_order=int(row.sort_order or 0),
        is_system=bool(getattr(row, "is_system", False)),
        group_name=str(gn).strip()[:128] if gn is not None and str(gn).strip() else None,
        subgroup_name=str(sn).strip()[:128] if sn is not None and str(sn).strip() else None,
        sort_group=int(getattr(row, "sort_group", 0) or 0),
        sort_subgroup=int(getattr(row, "sort_subgroup", 0) or 0),
        sort_status=int(getattr(row, "sort_status", 0) or 0),
        badge_color=badge,
        background_color=bg,
        text_color=tx,
        image_url=str(img).strip()[:512] if img is not None and str(img).strip() else None,
        is_active=bool(getattr(row, "is_active", True)),
    )


def _empty_panel_summary() -> OrderUiStatusPanelSummary:
    return OrderUiStatusPanelSummary(
        groups=[
            OrderUiPanelGroupBlock(main_group="NEW", group_display_name=None, total_count=0, sub_statuses=[]),  # type: ignore[arg-type]
            OrderUiPanelGroupBlock(
                main_group="IN_PROGRESS", group_display_name=None, total_count=0, sub_statuses=[]
            ),  # type: ignore[arg-type]
            OrderUiPanelGroupBlock(main_group="DONE", group_display_name=None, total_count=0, sub_statuses=[]),  # type: ignore[arg-type]
        ],
        unassigned_count=0,
    )


def build_order_ui_status_panel_summary(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    *,
    include_inactive: bool = False,
    include_archived_orders: bool = False,
) -> OrderUiStatusPanelSummary:
    try:
        q = db.query(OrderUiStatus).filter(
            OrderUiStatus.tenant_id == tenant_id,
            OrderUiStatus.warehouse_id == warehouse_id,
        )
        if not include_inactive:
            q = q.filter(OrderUiStatus.is_active.is_(True))
        statuses = (
            q.order_by(
                OrderUiStatus.sort_group.asc(),
                OrderUiStatus.main_group.asc(),
                OrderUiStatus.sort_subgroup.asc(),
                OrderUiStatus.sort_status.asc(),
                OrderUiStatus.sort_order.asc(),
                OrderUiStatus.id.asc(),
            ).all()
        )
        count_base = [
            Order.tenant_id == tenant_id,
            Order.warehouse_id == warehouse_id,
            Order.order_ui_status_id.isnot(None),
        ]
        if not include_archived_orders:
            count_base.append(Order.deleted_at.is_(None))
        counts_rows = (
            db.query(Order.order_ui_status_id, func.count(Order.id))
            .filter(*count_base)
            .group_by(Order.order_ui_status_id)
            .all()
        )
        cnt_map = {int(uid): int(c) for uid, c in counts_rows if uid is not None}

        cfg_rows = (
            db.query(PickingConfig)
            .filter(PickingConfig.tenant_id == tenant_id, PickingConfig.warehouse_id == warehouse_id)
            .all()
        )
        src_ids = {int(r.source_status_id) for r in cfg_rows}
        tgt_ids = {int(r.target_status_id) for r in cfg_rows}

        def _wms_role_for(status_id: int) -> Optional[str]:
            ins = status_id in src_ids
            intg = status_id in tgt_ids
            if ins and intg:
                return "both"
            if ins:
                return "picking_source"
            if intg:
                return "picking_target"
            return None

        unassigned_filters = [
            Order.tenant_id == tenant_id,
            Order.warehouse_id == warehouse_id,
            Order.order_ui_status_id.is_(None),
        ]
        if not include_archived_orders:
            unassigned_filters.append(Order.deleted_at.is_(None))
        unassigned = (
            db.query(func.count(Order.id))
            .filter(*unassigned_filters)
            .scalar()
            or 0
        )

        by_group: dict[str, List[OrderUiStatusWithCount]] = {g: [] for g in _GROUP_ORDER}
        for st in statuses:
            gkey = norm_order_ui_main_group(st.main_group)
            if gkey not in by_group:
                gkey = "NEW"
            sr = order_ui_status_row_to_read(st)
            by_group[gkey].append(
                OrderUiStatusWithCount(
                    id=sr.id,
                    tenant_id=sr.tenant_id,
                    warehouse_id=sr.warehouse_id,
                    main_group=sr.main_group,
                    name=sr.name,
                    color=sr.color,
                    sort_order=sr.sort_order,
                    is_system=sr.is_system,
                    group_name=sr.group_name,
                    subgroup_name=sr.subgroup_name,
                    sort_group=sr.sort_group,
                    sort_subgroup=sr.sort_subgroup,
                    sort_status=sr.sort_status,
                    badge_color=sr.badge_color,
                    background_color=sr.background_color,
                    text_color=sr.text_color,
                    image_url=sr.image_url,
                    is_active=sr.is_active,
                    count=cnt_map.get(st.id, 0),
                    wms_workflow_role=_wms_role_for(int(st.id)),
                )
            )

        groups_out: List[OrderUiPanelGroupBlock] = []
        for gkey in _GROUP_ORDER:
            sub_list = by_group.get(gkey, [])
            total = sum(s.count for s in sub_list)
            # Nazwy grup głównych są stałe (NEW/IN_PROGRESS/DONE) — nie bierzemy etykiet z legacy ``group_name``.
            groups_out.append(
                OrderUiPanelGroupBlock(
                    main_group=gkey,  # type: ignore[arg-type]
                    group_display_name=None,
                    total_count=total,
                    sub_statuses=sub_list,
                )
            )
        return OrderUiStatusPanelSummary(groups=groups_out, unassigned_count=int(unassigned))
    except SQLAlchemyError:
        logger.exception("build_order_ui_status_panel_summary: database error")
        return _empty_panel_summary()


def build_tenant_order_ui_status_panel_summary(
    db: Session,
    tenant_id: int,
    *,
    include_inactive: bool = False,
    include_archived_orders: bool = False,
) -> OrderUiStatusPanelSummary:
    """Tenant-wide panel counters — all fulfillment warehouses for the tenant."""
    try:
        q = db.query(OrderUiStatus).filter(OrderUiStatus.tenant_id == tenant_id)
        if not include_inactive:
            q = q.filter(OrderUiStatus.is_active.is_(True))
        statuses = (
            q.order_by(
                OrderUiStatus.warehouse_id.asc(),
                OrderUiStatus.sort_group.asc(),
                OrderUiStatus.main_group.asc(),
                OrderUiStatus.sort_subgroup.asc(),
                OrderUiStatus.sort_status.asc(),
                OrderUiStatus.sort_order.asc(),
                OrderUiStatus.id.asc(),
            ).all()
        )
        count_base = [
            Order.tenant_id == tenant_id,
            Order.order_ui_status_id.isnot(None),
        ]
        if not include_archived_orders:
            count_base.append(Order.deleted_at.is_(None))
        counts_rows = (
            db.query(Order.order_ui_status_id, func.count(Order.id))
            .filter(*count_base)
            .group_by(Order.order_ui_status_id)
            .all()
        )
        cnt_map = {int(uid): int(c) for uid, c in counts_rows if uid is not None}

        cfg_rows = db.query(PickingConfig).filter(PickingConfig.tenant_id == tenant_id).all()
        src_by_wh: dict[int, set[int]] = {}
        tgt_by_wh: dict[int, set[int]] = {}
        for r in cfg_rows:
            wid = int(r.warehouse_id)
            src_by_wh.setdefault(wid, set()).add(int(r.source_status_id))
            tgt_by_wh.setdefault(wid, set()).add(int(r.target_status_id))

        def _wms_role_for(status_id: int, warehouse_id: int) -> Optional[str]:
            wid = int(warehouse_id)
            src_ids = src_by_wh.get(wid, set())
            tgt_ids = tgt_by_wh.get(wid, set())
            ins = status_id in src_ids
            intg = status_id in tgt_ids
            if ins and intg:
                return "both"
            if ins:
                return "picking_source"
            if intg:
                return "picking_target"
            return None

        unassigned_filters = [
            Order.tenant_id == tenant_id,
            Order.order_ui_status_id.is_(None),
        ]
        if not include_archived_orders:
            unassigned_filters.append(Order.deleted_at.is_(None))
        unassigned = (
            db.query(func.count(Order.id))
            .filter(*unassigned_filters)
            .scalar()
            or 0
        )

        by_group: dict[str, List[OrderUiStatusWithCount]] = {g: [] for g in _GROUP_ORDER}
        for st in statuses:
            gkey = norm_order_ui_main_group(st.main_group)
            if gkey not in by_group:
                gkey = "NEW"
            sr = order_ui_status_row_to_read(st)
            by_group[gkey].append(
                OrderUiStatusWithCount(
                    id=sr.id,
                    tenant_id=sr.tenant_id,
                    warehouse_id=sr.warehouse_id,
                    main_group=sr.main_group,
                    name=sr.name,
                    color=sr.color,
                    sort_order=sr.sort_order,
                    is_system=sr.is_system,
                    group_name=sr.group_name,
                    subgroup_name=sr.subgroup_name,
                    sort_group=sr.sort_group,
                    sort_subgroup=sr.sort_subgroup,
                    sort_status=sr.sort_status,
                    badge_color=sr.badge_color,
                    background_color=sr.background_color,
                    text_color=sr.text_color,
                    image_url=sr.image_url,
                    is_active=sr.is_active,
                    count=cnt_map.get(st.id, 0),
                    wms_workflow_role=_wms_role_for(int(st.id), int(st.warehouse_id)),
                )
            )

        groups_out: List[OrderUiPanelGroupBlock] = []
        for gkey in _GROUP_ORDER:
            sub_list = by_group.get(gkey, [])
            total = sum(s.count for s in sub_list)
            groups_out.append(
                OrderUiPanelGroupBlock(
                    main_group=gkey,  # type: ignore[arg-type]
                    group_display_name=None,
                    total_count=total,
                    sub_statuses=sub_list,
                )
            )
        return OrderUiStatusPanelSummary(groups=groups_out, unassigned_count=int(unassigned))
    except SQLAlchemyError:
        logger.exception("build_tenant_order_ui_status_panel_summary: database error")
        return _empty_panel_summary()
