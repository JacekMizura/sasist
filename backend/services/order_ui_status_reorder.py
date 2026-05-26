"""Reorder panel order UI sub-statuses (custom / non-system only)."""

from __future__ import annotations

from typing import List

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.order_ui_status import OrderUiStatus
from ..schemas.order import OrderSubstatusReorderRequest, OrderUiStatusPanelSummary
from .order_ui_status_panel import build_order_ui_status_panel_summary, norm_order_ui_main_group


def _load_group_rows(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    main_group: str,
) -> List[OrderUiStatus]:
    mg = norm_order_ui_main_group(main_group)
    return (
        db.query(OrderUiStatus)
        .filter(
            OrderUiStatus.tenant_id == int(tenant_id),
            OrderUiStatus.warehouse_id == int(warehouse_id),
            OrderUiStatus.main_group == mg,
        )
        .order_by(OrderUiStatus.sort_subgroup.asc(), OrderUiStatus.sort_status.asc(), OrderUiStatus.sort_order.asc(), OrderUiStatus.id.asc())
        .all()
    )


def _apply_merged_sort(db: Session, systems: List[OrderUiStatus], customs: List[OrderUiStatus]) -> None:
    merged = list(systems) + list(customs)
    for i, r in enumerate(merged):
        r.sort_order = int(i)
        if hasattr(r, "sort_status"):
            r.sort_status = int(i)
    db.flush()


def _split_system_custom(rows: List[OrderUiStatus]) -> tuple[List[OrderUiStatus], List[OrderUiStatus]]:
    systems = [r for r in rows if bool(getattr(r, "is_system", False))]
    customs = [r for r in rows if not bool(getattr(r, "is_system", False))]
    systems.sort(key=lambda r: (int(r.sort_order or 0), int(r.id)))
    customs.sort(key=lambda r: (int(r.sort_order or 0), int(r.id)))
    return systems, customs


def reindex_order_ui_group(db: Session, *, tenant_id: int, warehouse_id: int, main_group: str) -> None:
    rows = _load_group_rows(db, tenant_id=tenant_id, warehouse_id=warehouse_id, main_group=main_group)
    systems, customs = _split_system_custom(rows)
    _apply_merged_sort(db, systems, customs)


def apply_order_substatus_reorder(
    db: Session,
    body: OrderSubstatusReorderRequest,
) -> OrderUiStatusPanelSummary:
    tid = int(body.tenant_id)
    wid = int(body.warehouse_id)
    mg = norm_order_ui_main_group(body.main_group)

    rows = _load_group_rows(db, tenant_id=tid, warehouse_id=wid, main_group=mg)
    systems, customs = _split_system_custom(rows)
    by_id = {int(r.id): r for r in rows}

    if body.ordered_ids is not None:
        custom_ids_db = {int(r.id) for r in customs}
        ordered = [int(x) for x in body.ordered_ids]
        if len(ordered) != len(set(ordered)):
            raise HTTPException(status_code=400, detail="ordered_ids must be unique")
        if set(ordered) != custom_ids_db:
            raise HTTPException(
                status_code=400,
                detail="ordered_ids must list every non-system status in this group exactly once",
            )
        customs_new: List[OrderUiStatus] = []
        for oid in ordered:
            row = by_id.get(oid)
            if row is None or bool(getattr(row, "is_system", False)):
                raise HTTPException(status_code=400, detail=f"Invalid or system status id in ordered_ids: {oid}")
            customs_new.append(row)
        _apply_merged_sort(db, systems, customs_new)
        db.commit()
        return build_order_ui_status_panel_summary(db, tid, wid)

    sid = int(body.status_id or 0)
    direction = body.direction
    assert direction is not None
    row = by_id.get(sid)
    if row is None:
        raise HTTPException(status_code=404, detail="Status not found")
    if bool(getattr(row, "is_system", False)):
        raise HTTPException(status_code=400, detail="Cannot reorder system statuses")

    idx = next((i for i, r in enumerate(customs) if int(r.id) == sid), None)
    if idx is None:
        raise HTTPException(status_code=400, detail="Status not in this group")
    j = idx - 1 if direction == "up" else idx + 1
    if j < 0 or j >= len(customs):
        db.commit()
        return build_order_ui_status_panel_summary(db, tid, wid)
    customs[idx], customs[j] = customs[j], customs[idx]
    _apply_merged_sort(db, systems, customs)
    db.commit()
    return build_order_ui_status_panel_summary(db, tid, wid)
