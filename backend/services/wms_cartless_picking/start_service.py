"""Start cartless picking — bez WarehouseCart / claim / order.cart_id."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.order import Order
from ...models.picking_config import PickingConfig
from ...models.wms_operation_session import WmsOperationSession
from ..cart_picking_lifecycle_service import SESSION_KIND_PICKING_ACTIVE
from ..order_fulfillment_lifecycle_service import on_picking_started
from ..order_fulfillment_state import PICKING as FS_PICKING
from ..order_fulfillment_state import PICKING_IN_PROGRESS
from ..wms_order_validation.gate import gate_orders_before_capacity
from ..wms_picking_product_list_service import (
    OPERATOR_MSG_NO_ASSIGNABLE_AFTER_VALIDATION,
    _order_type_filter,
    _query_order_ids_for_status,
)
from .scope import assert_orders_unclaimed_for_assign, find_open_cartless_picking_session

logger = logging.getLogger(__name__)


class CartlessPickingError(Exception):
    def __init__(self, message: str, *, code: str = "cartless_error"):
        super().__init__(message)
        self.message = message
        self.code = code


def _dump_meta(meta: dict[str, Any]) -> str:
    return json.dumps(meta, ensure_ascii=False, default=str)


def _order_snapshot(o: Order) -> dict[str, Any]:
    return {
        "order_id": int(o.id),
        "status": getattr(o, "status", None),
        "fulfillment_state": getattr(o, "fulfillment_state", None),
        "order_ui_status_id": getattr(o, "order_ui_status_id", None),
        "fulfillment_assignment_phase": getattr(o, "fulfillment_assignment_phase", None),
    }


def _resolve_bulk_limit(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    order_type: str,
) -> int | None:
    pc = (
        db.query(PickingConfig)
        .filter(
            PickingConfig.tenant_id == int(tenant_id),
            PickingConfig.warehouse_id == int(warehouse_id),
            PickingConfig.source_status_id == int(source_status_id),
        )
        .first()
    )
    if pc is None:
        return None
    ot = (order_type or "all").strip().lower()
    if ot == "single":
        v = getattr(pc, "max_single_orders", None)
        return int(v) if v is not None and int(v) > 0 else None
    if ot == "multi":
        v = getattr(pc, "max_multi_orders", None)
        return int(v) if v is not None and int(v) > 0 else None
    # all → mniejszy z ustawionych limitów single/multi (jeśli są), inaczej max(single, multi)
    caps: list[int] = []
    for attr in ("max_single_orders", "max_multi_orders"):
        raw = getattr(pc, attr, None)
        if raw is not None and int(raw) > 0:
            caps.append(int(raw))
    if not caps:
        return None
    return max(caps)


def start_cartless_picking(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    order_type: str,
    operator_user_id: int,
    fixed_order_ids: list[int] | None = None,
) -> tuple[WmsOperationSession | None, str | None]:
    """
    Cartless start: session.cart_id=NULL, order.cart_id pozostaje NULL,
    order.picking_session_id = session.id.

    Returns: (session | None, operator_message | None)
    """
    uid = int(operator_user_id)
    if uid <= 0:
        raise CartlessPickingError("Wymagany operator.", code="operator_required")

    existing = find_open_cartless_picking_session(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        operator_user_id=uid,
    )
    if existing is not None:
        # Idempotent: wznów istniejącą sesję operatora (bez drugiego claim).
        on_sess = (
            db.query(Order.id)
            .filter(Order.picking_session_id == int(existing.id), Order.deleted_at.is_(None))
            .count()
        )
        if on_sess > 0:
            logger.info(
                "cartless.start resume session_id=%s operator=%s orders=%s",
                int(existing.id),
                uid,
                on_sess,
            )
            return existing, None

    ot = _order_type_filter(order_type)  # type: ignore[arg-type]
    if fixed_order_ids is not None:
        order_ids = [int(x) for x in fixed_order_ids if int(x) > 0]
    else:
        order_ids = _query_order_ids_for_status(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            source_status_id=int(source_status_id),
            order_type=ot,
        )

    orders: list[Order] = []
    if order_ids:
        raw = (
            db.query(Order)
            .filter(
                Order.id.in_(order_ids),
                Order.deleted_at.is_(None),
            )
            .order_by(Order.id.asc())
            .with_for_update()
            .all()
        )
        orders = assert_orders_unclaimed_for_assign(raw)

    if not orders:
        return None, None

    orders = gate_orders_before_capacity(
        db,
        orders=orders,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        operator_user_id=None,
    )
    if not orders:
        return None, OPERATOR_MSG_NO_ASSIGNABLE_AFTER_VALIDATION

    limit = _resolve_bulk_limit(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        source_status_id=int(source_status_id),
        order_type=str(ot),
    )
    if limit is not None and len(orders) > limit:
        orders = orders[: int(limit)]

    now = datetime.utcnow()
    meta = {
        "cartless": True,
        "source_status_id": int(source_status_id),
        "order_type": str(ot),
        "orders_snapshot": [_order_snapshot(o) for o in orders],
    }
    sess = WmsOperationSession(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        cart_id=None,
        order_id=None,
        session_kind=SESSION_KIND_PICKING_ACTIVE,
        operator_user_id=uid,
        started_at=now,
        last_activity_at=now,
        completed_at=None,
        paused_duration_seconds=0,
        metadata_json=_dump_meta(meta),
    )
    db.add(sess)
    db.flush()
    sid = int(sess.id)

    # Atomowe claim: tylko wolne zamówienia (race z równoległym startem).
    claimed: list[Order] = []
    for o in orders:
        db.refresh(o)
        if getattr(o, "cart_id", None) is not None:
            continue
        ps = getattr(o, "picking_session_id", None)
        if ps is not None and int(ps) > 0:
            continue
        o.picking_session_id = sid
        # NIGDY nie ustawiaj cart_id w cartless
        assert getattr(o, "cart_id", None) is None
        on_picking_started(o)
        fs = (getattr(o, "fulfillment_state", None) or "").strip().upper()
        if fs in ("", FS_PICKING, "PARTIAL"):
            o.fulfillment_state = PICKING_IN_PROGRESS
        if getattr(o, "picking_started_at", None) is None:
            o.picking_started_at = now
        st_o = (getattr(o, "status", None) or "").strip().upper()
        if st_o in ("", "NEW", "ASSIGNED", "READY"):
            o.status = "PICKING_IN_PROGRESS"
        db.add(o)
        claimed.append(o)

    if not claimed:
        sess.completed_at = now
        sess.completed_reason = "no_orders_race"
        db.add(sess)
        return None, OPERATOR_MSG_NO_ASSIGNABLE_AFTER_VALIDATION

    # Aktualizuj snapshot do faktycznie claimowanych
    meta["orders_snapshot"] = [_order_snapshot(o) for o in claimed]
    meta["assigned_order_ids"] = [int(o.id) for o in claimed]
    sess.metadata_json = _dump_meta(meta)
    db.add(sess)

    logger.info(
        "cartless.start session_id=%s operator=%s assigned=%s cart_id=NULL",
        sid,
        uid,
        [int(o.id) for o in claimed],
    )
    return sess, None
