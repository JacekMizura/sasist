"""
Publiczny, tylko-do-odczytu dostęp do konfiguracji zbierania.

Użyj ``getPickingConfig`` (alias) poza warstwą API — bez efektów ubocznych.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.picking_config import PickingConfig


def get_picking_config(db: Session, tenant_id: int, warehouse_id: int, status_id: int) -> Optional[PickingConfig]:
    """Zwraca ``PickingConfig`` dla ``source_status_id == status_id`` lub ``None``."""
    return (
        db.query(PickingConfig)
        .filter(
            PickingConfig.tenant_id == int(tenant_id),
            PickingConfig.warehouse_id == int(warehouse_id),
            PickingConfig.source_status_id == int(status_id),
        )
        .first()
    )


def _first_warehouse_picking_config(db: Session, tenant_id: int, warehouse_id: int) -> Optional[PickingConfig]:
    return (
        db.query(PickingConfig)
        .filter(
            PickingConfig.tenant_id == int(tenant_id),
            PickingConfig.warehouse_id == int(warehouse_id),
        )
        .order_by(PickingConfig.id.asc())
        .first()
    )


def resolve_picking_config_for_shortage_report(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    order_item_id: int | None = None,
    recovery_order_id: int | None = None,
) -> tuple[Optional[PickingConfig], dict[str, Any]]:
    """
    Konfiguracja zbierania dla ``report-shortage``.

    Zwykła kohorta: wymagany config dla ``source_status_id``.
    Zamiennik / dogrywka: najpierw status zamówienia linii, potem dowolna reguła magazynu.
    """
    tid, wid = int(tenant_id), int(warehouse_id)
    oiid = int(order_item_id) if order_item_id is not None and int(order_item_id) > 0 else None
    roid = int(recovery_order_id) if recovery_order_id is not None and int(recovery_order_id) > 0 else None
    workflow_scoped = oiid is not None or roid is not None
    workflow_type = "recovery" if roid is not None else ("line_scoped" if oiid is not None else "cohort")
    tried: list[int] = []
    ctx: dict[str, Any] = {
        "workflow_scoped": workflow_scoped,
        "workflow_type": workflow_type,
        "requested_source_status_id": int(source_status_id),
        "order_item_id": oiid,
        "recovery_order_id": roid,
        "resolution": None,
    }

    def try_status(sid: int) -> Optional[PickingConfig]:
        if sid <= 0 or sid in tried:
            return None
        tried.append(sid)
        return get_picking_config(db, tid, wid, sid)

    pc = try_status(int(source_status_id))
    if pc is not None:
        ctx["resolution"] = "request_source_status"
        ctx["resolved_source_status_id"] = int(pc.source_status_id)
        return pc, ctx

    status_candidates: list[int] = []
    replacement_item_id: int | None = None
    if oiid is not None:
        oi = db.query(OrderItem).filter(OrderItem.id == oiid).first()
        if oi is not None:
            rep_from = int(getattr(oi, "replaced_from_order_item_id", 0) or 0)
            if rep_from > 0:
                replacement_item_id = oiid
                workflow_type = "replacement"
                ctx["workflow_type"] = workflow_type
            o = db.query(Order).filter(Order.id == int(oi.order_id), Order.tenant_id == tid).first()
            if o is not None and getattr(o, "order_ui_status_id", None) is not None:
                status_candidates.append(int(o.order_ui_status_id))
            ctx["order_id"] = int(oi.order_id)

    if roid is not None:
        o = db.query(Order).filter(Order.id == roid, Order.tenant_id == tid).first()
        if o is not None and getattr(o, "order_ui_status_id", None) is not None:
            status_candidates.append(int(o.order_ui_status_id))
        ctx["order_id"] = roid

    ctx["replacement_item_id"] = replacement_item_id
    for sid in status_candidates:
        pc = try_status(sid)
        if pc is not None:
            ctx["resolution"] = "order_panel_status"
            ctx["resolved_source_status_id"] = int(pc.source_status_id)
            return pc, ctx

    pc = _first_warehouse_picking_config(db, tid, wid)
    if pc is not None:
        ctx["resolution"] = "warehouse_default"
        ctx["resolved_source_status_id"] = int(pc.source_status_id)
        return pc, ctx

    if workflow_scoped:
        ctx["resolution"] = "workflow_without_config"
        ctx["resolved_source_status_id"] = int(source_status_id)
        return None, ctx

    ctx["resolution"] = "missing"
    return None, ctx


# Jawny alias pod integrację (camelCase wg konwencji użytkownika)
getPickingConfig = get_picking_config
