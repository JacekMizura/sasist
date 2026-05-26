"""Panel return UI statuses — serializacja i podsumowanie (jak zamówienia)."""

from __future__ import annotations

import logging
from typing import List

from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..models.return_ui_status import ReturnUiStatus
from ..models.wms_order_return import WmsOrderReturn
from ..schemas.wms_return import (
    ReturnUiPanelGroupBlock,
    ReturnUiStatusPanelSummary,
    ReturnUiStatusRead,
    ReturnUiStatusWithCount,
)
from ..utils.panel_ui_status_tokens import resolve_panel_status_tokens
from ..utils.ui_status_color import normalize_stored_color

logger = logging.getLogger(__name__)

_GROUP_ORDER: tuple[str, ...] = ("NEW", "IN_PROGRESS", "DONE")
_VALID_GROUP = frozenset(_GROUP_ORDER)


def norm_return_ui_main_group(raw: object) -> str:
    s = str(raw or "NEW").strip().upper()
    return s if s in _VALID_GROUP else "NEW"


def return_ui_status_row_to_read(row: ReturnUiStatus) -> ReturnUiStatusRead:
    _, badge, bg, tx = resolve_panel_status_tokens(row)
    gn = getattr(row, "group_name", None)
    sn = getattr(row, "subgroup_name", None)
    img = getattr(row, "image_url", None)
    return ReturnUiStatusRead(
        id=row.id,
        tenant_id=row.tenant_id,
        warehouse_id=row.warehouse_id,
        main_group=norm_return_ui_main_group(row.main_group),  # type: ignore[arg-type]
        name=row.name,
        color=normalize_stored_color(row.color),
        sort_order=int(row.sort_order or 0),
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


def _empty_panel_summary() -> ReturnUiStatusPanelSummary:
    return ReturnUiStatusPanelSummary(
        groups=[
            ReturnUiPanelGroupBlock(main_group="NEW", group_display_name=None, total_count=0, sub_statuses=[]),  # type: ignore[arg-type]
            ReturnUiPanelGroupBlock(
                main_group="IN_PROGRESS", group_display_name=None, total_count=0, sub_statuses=[]
            ),  # type: ignore[arg-type]
            ReturnUiPanelGroupBlock(main_group="DONE", group_display_name=None, total_count=0, sub_statuses=[]),  # type: ignore[arg-type]
        ],
        unassigned_count=0,
    )


def build_return_ui_status_panel_summary(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    *,
    include_inactive: bool = False,
) -> ReturnUiStatusPanelSummary:
    try:
        q = db.query(ReturnUiStatus).filter(
            ReturnUiStatus.tenant_id == tenant_id,
            ReturnUiStatus.warehouse_id == warehouse_id,
        )
        if not include_inactive:
            q = q.filter(ReturnUiStatus.is_active.is_(True))
        statuses = (
            q.order_by(
                ReturnUiStatus.sort_group.asc(),
                ReturnUiStatus.main_group.asc(),
                ReturnUiStatus.sort_subgroup.asc(),
                ReturnUiStatus.sort_status.asc(),
                ReturnUiStatus.sort_order.asc(),
                ReturnUiStatus.id.asc(),
            ).all()
        )
        counts_rows = (
            db.query(WmsOrderReturn.ui_status_id, func.count(WmsOrderReturn.id))
            .filter(
                WmsOrderReturn.tenant_id == tenant_id,
                WmsOrderReturn.warehouse_id == warehouse_id,
                WmsOrderReturn.ui_status_id.isnot(None),
                WmsOrderReturn.deleted_at.is_(None),
            )
            .group_by(WmsOrderReturn.ui_status_id)
            .all()
        )
        cnt_map = {int(uid): int(c) for uid, c in counts_rows if uid is not None}

        unassigned = (
            db.query(func.count(WmsOrderReturn.id))
            .filter(
                WmsOrderReturn.tenant_id == tenant_id,
                WmsOrderReturn.warehouse_id == warehouse_id,
                WmsOrderReturn.ui_status_id.is_(None),
                WmsOrderReturn.deleted_at.is_(None),
            )
            .scalar()
            or 0
        )

        by_group: dict[str, List[ReturnUiStatusWithCount]] = {g: [] for g in _GROUP_ORDER}
        for st in statuses:
            gkey = norm_return_ui_main_group(st.main_group)
            if gkey not in by_group:
                gkey = "NEW"
            sr = return_ui_status_row_to_read(st)
            by_group[gkey].append(
                ReturnUiStatusWithCount(
                    id=sr.id,
                    tenant_id=sr.tenant_id,
                    warehouse_id=sr.warehouse_id,
                    main_group=sr.main_group,
                    name=sr.name,
                    color=sr.color,
                    sort_order=sr.sort_order,
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
                )
            )

        groups_out: List[ReturnUiPanelGroupBlock] = []
        for gkey in _GROUP_ORDER:
            sub_list = by_group.get(gkey, [])
            total = sum(s.count for s in sub_list)
            groups_out.append(
                ReturnUiPanelGroupBlock(
                    main_group=gkey,  # type: ignore[arg-type]
                    group_display_name=None,
                    total_count=total,
                    sub_statuses=sub_list,
                )
            )
        return ReturnUiStatusPanelSummary(groups=groups_out, unassigned_count=int(unassigned))
    except SQLAlchemyError:
        logger.exception("build_return_ui_status_panel_summary: database error")
        return _empty_panel_summary()
