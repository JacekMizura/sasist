"""Dogrywka zbierki (recovery_pick) — zadanie operacyjne WMS po decyzji OMS."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Literal

from sqlalchemy.orm import Session, joinedload

from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.wms_recovery_pick_task import WmsRecoveryPickTask
from .order_fulfillment_recompute import (
    order_has_pending_replacement_picking,
    recompute_order_fulfillment,
)
from .order_issue_task_service import count_issue_queue_operational_lines

OmsPatchKind = Literal["replace_product", "remove_missing", "waiting_for_stock", "other"]


def _order_item_meta_dict(item: OrderItem) -> dict[str, Any]:
    raw = getattr(item, "metadata_json", None)
    if not raw or not str(raw).strip():
        return {}
    try:
        m = json.loads(raw)
        return m if isinstance(m, dict) else {}
    except json.JSONDecodeError:
        return {}


def order_has_waiting_customer_line(order: Order) -> bool:
    """OMS oznaczył „czeka na towar” na którejkolwiek linii."""
    for oi in order.items or []:
        if _order_item_meta_dict(oi).get("oms_waiting_for_stock"):
            return True
    return False


def braki_queue_bucket(db: Session, order: Order, *, u_short: int, r_pend: int) -> str:
    """
    Etykieta kolejki Braki — rozdzielenie stanu operacyjnego od statusu OMS.
    waiting_customer | awaiting_oms | recovery_ready
    """
    if order_has_waiting_customer_line(order):
        return "waiting_customer"
    if int(u_short) > 0:
        return "awaiting_oms"
    if int(r_pend) > 0:
        return "recovery_ready"
    return "awaiting_oms"


def _needs_recovery_picking(db: Session, order: Order) -> bool:
    """Pozostała praca magazynowa (zamiennik / TO_PICK) przy braku nierozwiązanych braków OMS na liniach."""
    u, r = count_issue_queue_operational_lines(db, order)
    if int(u) > 0:
        return False
    if int(r) > 0 or order_has_pending_replacement_picking(db, order):
        return True
    return False


def ensure_recovery_pick_task(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    kind: OmsPatchKind,
) -> WmsRecoveryPickTask | None:
    """
    Po akcji OMS: utwórz / otwórz recovery_pick, jeśli nadal jest co zbierać.
    Dla ``remove_missing`` i ``waiting_for_stock`` — tylko gdy faktycznie zostaje praca magazynowa.
    """
    if kind == "waiting_for_stock":
        return None
    recompute_order_fulfillment(db, int(order.id), commit=False)
    db.refresh(order)
    order = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(Order.id == int(order.id))
        .first()
        or order
    )
    if not _needs_recovery_picking(db, order):
        return None

    now = datetime.utcnow()
    row = (
        db.query(WmsRecoveryPickTask)
        .filter(
            WmsRecoveryPickTask.tenant_id == int(tenant_id),
            WmsRecoveryPickTask.warehouse_id == int(warehouse_id),
            WmsRecoveryPickTask.order_id == int(order.id),
        )
        .first()
    )
    if row is None:
        row = WmsRecoveryPickTask(
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=int(order.id),
            status="open",
            created_at=now,
            updated_at=now,
        )
        db.add(row)
        db.flush()
        return row
    if row.status != "open":
        row.status = "open"
    row.updated_at = now
    return row


def get_open_recovery_task_for_order(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
) -> WmsRecoveryPickTask | None:
    return (
        db.query(WmsRecoveryPickTask)
        .filter(
            WmsRecoveryPickTask.tenant_id == int(tenant_id),
            WmsRecoveryPickTask.warehouse_id == int(warehouse_id),
            WmsRecoveryPickTask.order_id == int(order_id),
            WmsRecoveryPickTask.status == "open",
        )
        .first()
    )


def mark_recovery_task_done(db: Session, task: WmsRecoveryPickTask) -> None:
    task.status = "done"
    task.updated_at = datetime.utcnow()
