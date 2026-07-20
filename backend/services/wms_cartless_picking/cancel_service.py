"""Cancel / close cartless picking session — bez WarehouseCart."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.order import Order
from ..order_fulfillment_state import PICKING as FS_PICKING
from ..order_fulfillment_state import clear_order_picking_session_context
from .scope import get_cartless_session_or_raise, list_orders_on_picking_session

logger = logging.getLogger(__name__)


def _load_meta(raw: str | None) -> dict[str, Any]:
    if not raw or not str(raw).strip():
        return {}
    try:
        m = json.loads(raw)
        return m if isinstance(m, dict) else {}
    except json.JSONDecodeError:
        return {}


def cancel_cartless_picking_session(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    session_id: int,
    operator_user_id: int,
    reason: str = "cancel_picking",
    allow_system: bool = False,
) -> dict[str, Any]:
    """
    Anuluj cartless: przywróć snapshot statusów, wyczyść picking_session_id,
    zamknij sesję. order.cart_id pozostaje NULL. Bez release_cart.
    """
    try:
        sess = get_cartless_session_or_raise(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            session_id=int(session_id),
            operator_user_id=int(operator_user_id) if int(operator_user_id) > 0 else None,
            require_open=True,
            allow_system=bool(allow_system),
        )
    except PermissionError as e:
        raise ValueError(str(e)) from e

    meta = _load_meta(getattr(sess, "metadata_json", None))
    snaps = meta.get("orders_snapshot") if isinstance(meta.get("orders_snapshot"), list) else []
    snap_by_id = {
        int(s["order_id"]): s
        for s in snaps
        if isinstance(s, dict) and s.get("order_id") is not None
    }

    orders = list_orders_on_picking_session(db, session_id=int(session_id))

    from ..wms_picking_corrections.cancel_session_rollback_service import (
        rollback_wms_picking_session_mutations,
    )

    rollback = rollback_wms_picking_session_mutations(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        cart_id=None,
        picking_session_id=int(session_id),
        orders=orders,
        operator_user_id=operator_user_id,
        cart=None,
        sess=sess,
    )

    restored = 0
    for o in orders:
        snap = snap_by_id.get(int(o.id))
        # cartless: clear session only (cart already NULL)
        clear_order_picking_session_context(o)
        assert getattr(o, "cart_id", None) is None
        if snap:
            if "status" in snap:
                o.status = snap["status"]
            if "fulfillment_state" in snap:
                o.fulfillment_state = snap["fulfillment_state"]
            if "order_ui_status_id" in snap:
                o.order_ui_status_id = snap["order_ui_status_id"]
            if "fulfillment_assignment_phase" in snap and snap["fulfillment_assignment_phase"]:
                o.fulfillment_assignment_phase = snap["fulfillment_assignment_phase"]
        else:
            if (getattr(o, "status", None) or "").upper() == "PICKING_IN_PROGRESS":
                o.status = "NEW"
            if (getattr(o, "fulfillment_state", None) or "").upper() == FS_PICKING:
                o.fulfillment_state = None
        o.picking_started_at = None
        db.add(o)
        restored += 1

    now = datetime.utcnow()
    sess.completed_at = now
    sess.last_activity_at = now
    sess.completed_reason = str(reason or "cancelled")[:32]
    db.add(sess)

    logger.info(
        "cartless.cancel session_id=%s operator=%s restored=%s reason=%s rollback=%s",
        int(session_id),
        int(operator_user_id),
        restored,
        reason,
        {
            "drafts": rollback.get("draft_picks_deleted"),
            "shortages": len(rollback.get("shortages_rolled_back") or []),
        },
    )
    return {
        "session_id": int(session_id),
        "orders_restored": restored,
        "cart_id": None,
        "cart_status": None,
        "idempotent": False,
        "rollback": rollback,
    }


def touch_cartless_picking_session(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    session_id: int,
    operator_user_id: int,
) -> dict[str, Any]:
    sess = get_cartless_session_or_raise(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        session_id=int(session_id),
        operator_user_id=int(operator_user_id),
        require_open=True,
    )
    now = datetime.utcnow()
    sess.last_activity_at = now
    db.add(sess)
    return {
        "session_id": int(sess.id),
        "cart_id": None,
        "last_activity_at": now.isoformat(timespec="seconds") + "Z",
        "status": "PICKING",
    }


def release_stale_cartless_sessions(
    db: Session,
    *,
    idle_minutes: int = 45,
) -> int:
    """Timeout: zamknij idle cartless sessions i zwolnij orders (picking_session_id)."""
    from datetime import timedelta

    from ...models.wms_operation_session import WmsOperationSession
    from ..cart_picking_lifecycle_service import SESSION_KIND_PICKING_ACTIVE

    cutoff = datetime.utcnow() - timedelta(minutes=int(idle_minutes))
    rows = (
        db.query(WmsOperationSession)
        .filter(
            WmsOperationSession.session_kind == SESSION_KIND_PICKING_ACTIVE,
            WmsOperationSession.cart_id.is_(None),
            WmsOperationSession.completed_at.is_(None),
            WmsOperationSession.last_activity_at.isnot(None),
            WmsOperationSession.last_activity_at < cutoff,
        )
        .all()
    )
    n = 0
    for sess in rows:
        cancel_cartless_picking_session(
            db,
            tenant_id=int(sess.tenant_id),
            warehouse_id=int(sess.warehouse_id),
            session_id=int(sess.id),
            operator_user_id=int(getattr(sess, "operator_user_id", None) or 0),
            reason="cartless_timeout",
            allow_system=True,
        )
        n += 1
    return n
