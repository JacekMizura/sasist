"""
Cartless picking session membership SSOT.

Membership = ``Order.picking_session_id`` (not UI status alone).
Session seed snapshots ``source_status_id`` in metadata; after seed, panel status
can diverge — this module revalidates and releases stale members.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...models.order import Order
from ...models.pick import Pick
from ...models.wms_operation_session import WmsOperationSession
from ..cart_picking_lifecycle_service import SESSION_KIND_PICKING_ACTIVE
from ..order_fulfillment_state import PICKING as FS_PICKING
from ..order_fulfillment_state import clear_order_picking_session_context

logger = logging.getLogger(__name__)

CARTLESS_STATUS_CHANGE_BLOCKED_MSG = (
    "Nie można zmienić statusu — zamówienie jest w trakcie zbierania. "
    "Anuluj sesję zbierania lub dokończ kompletację przed zmianą statusu."
)


def _load_meta(raw: str | None) -> dict[str, Any]:
    if not raw or not str(raw).strip():
        return {}
    try:
        m = json.loads(raw)
        return m if isinstance(m, dict) else {}
    except json.JSONDecodeError:
        return {}


def _dump_meta(meta: dict[str, Any]) -> str:
    return json.dumps(meta, ensure_ascii=False, separators=(",", ":"))


def session_source_status_id(sess: WmsOperationSession) -> int | None:
    meta = _load_meta(getattr(sess, "metadata_json", None))
    raw = meta.get("source_status_id")
    try:
        sid = int(raw) if raw is not None else 0
    except (TypeError, ValueError):
        return None
    return sid if sid > 0 else None


def order_has_cartless_picking_progress(db: Session, *, order_id: int) -> bool:
    """True when any cartless Pick exists for the order (factual picking started)."""
    n = (
        db.query(func.count(Pick.id))
        .filter(
            Pick.order_id == int(order_id),
            Pick.cart_id.is_(None),
            Pick.status.in_(("done", "picking", "waiting")),
        )
        .scalar()
    )
    return int(n or 0) > 0


def order_belongs_to_picking_session_source(
    order: Order,
    *,
    session_id: int,
    source_status_id: int,
) -> bool:
    """
    Canonical invariant: order is a member of this session **and** still in the
    session's source panel status.
    """
    ps = getattr(order, "picking_session_id", None)
    if ps is None or int(ps) != int(session_id):
        return False
    ou = getattr(order, "order_ui_status_id", None)
    if ou is None:
        return False
    return int(ou) == int(source_status_id)


def _emit_removed_from_session_activity(
    db: Session,
    *,
    order: Order,
    session_id: int,
    operator_user_id: int | None,
    reason: str,
) -> None:
    try:
        from ..wms_audit_service import append_order_activity_for_wms, insert_wms_order_event
        from ...models.wms_order_event import EVT_PICKING_CANCELLED

        tid = int(order.tenant_id)
        wid = int(order.warehouse_id)
        oid = int(order.id)
        uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
        msg = (
            "Zamówienie usunięto z aktywnej sesji zbierania po zmianie statusu."
            if reason == "panel_status_left_source"
            else "Zamówienie usunięto z aktywnej sesji zbierania (niespójny status)."
        )
        meta: dict[str, Any] = {
            "event_code": EVT_PICKING_CANCELLED,
            "cartless": True,
            "picking_session_id": int(session_id),
            "reason": str(reason),
            "scope": "single_order_release",
            "activity_title": msg,
        }
        row = insert_wms_order_event(
            db,
            tenant_id=tid,
            warehouse_id=wid,
            order_id=oid,
            operator_user_id=uid,
            event_type=EVT_PICKING_CANCELLED,
            target_cart_id=None,
            metadata=meta,
        )
        append_order_activity_for_wms(
            db,
            order_id=oid,
            tenant_id=tid,
            warehouse_id=wid,
            event_type=EVT_PICKING_CANCELLED,
            message=msg,
            operator_user_id=uid,
            metadata=meta,
            wms_order_event_id=int(row.id) if row is not None else None,
        )
    except Exception:
        logger.exception(
            "cartless membership activity failed order_id=%s session_id=%s",
            getattr(order, "id", None),
            session_id,
        )


def release_order_from_cartless_session(
    db: Session,
    *,
    order: Order,
    reason: str = "panel_status_left_source",
    operator_user_id: int | None = None,
    preserve_panel_status: bool = True,
) -> dict[str, Any]:
    """
    Detach one order from an open cartless session.

    Does **not** overwrite ``order_ui_status_id`` when ``preserve_panel_status``
    (caller already applied the new panel status).
    Closes the session when no members remain.
    """
    ps = getattr(order, "picking_session_id", None)
    if ps is None or int(ps) <= 0:
        return {"released": False, "reason": "not_on_session"}

    session_id = int(ps)
    sess = (
        db.query(WmsOperationSession)
        .filter(
            WmsOperationSession.id == session_id,
            WmsOperationSession.cart_id.is_(None),
            WmsOperationSession.session_kind == SESSION_KIND_PICKING_ACTIVE,
        )
        .first()
    )

    clear_order_picking_session_context(order)
    assert getattr(order, "cart_id", None) is None
    if (getattr(order, "status", None) or "").upper() in ("PICKING", "PICKING_IN_PROGRESS"):
        order.status = "NEW"
    if (getattr(order, "fulfillment_state", None) or "").upper() == FS_PICKING:
        order.fulfillment_state = None
    order.picking_started_at = None
    db.add(order)

    session_closed = False
    if sess is not None and getattr(sess, "completed_at", None) is None:
        meta = _load_meta(getattr(sess, "metadata_json", None))
        assigned = meta.get("assigned_order_ids")
        if isinstance(assigned, list):
            meta["assigned_order_ids"] = [
                int(x) for x in assigned if int(x) != int(order.id)
            ]
        snaps = meta.get("orders_snapshot")
        if isinstance(snaps, list):
            meta["orders_snapshot"] = [
                s
                for s in snaps
                if not (isinstance(s, dict) and int(s.get("order_id") or 0) == int(order.id))
            ]
        remaining = (
            db.query(func.count(Order.id))
            .filter(
                Order.picking_session_id == session_id,
                Order.deleted_at.is_(None),
                Order.id != int(order.id),
            )
            .scalar()
        )
        if int(remaining or 0) <= 0:
            now = datetime.utcnow()
            sess.completed_at = now
            sess.last_activity_at = now
            sess.completed_reason = str(reason or "membership_empty")[:32]
            session_closed = True
        sess.metadata_json = _dump_meta(meta)
        db.add(sess)

    _emit_removed_from_session_activity(
        db,
        order=order,
        session_id=session_id,
        operator_user_id=operator_user_id,
        reason=reason,
    )
    logger.info(
        "cartless.membership.release order_id=%s session_id=%s reason=%s closed=%s",
        int(order.id),
        session_id,
        reason,
        session_closed,
    )
    return {
        "released": True,
        "order_id": int(order.id),
        "session_id": session_id,
        "session_closed": session_closed,
        "preserve_panel_status": bool(preserve_panel_status),
        "reason": reason,
    }


def assert_cartless_panel_status_change_allowed(
    db: Session,
    *,
    order: Order,
    new_status_id: int | None,
) -> None:
    """
    Raise ``CartLifecycleError`` when leaving session source status while
    factual cartless picks exist (blocks silent ERP/WMS split-brain).
    """
    if getattr(order, "cart_id", None) is not None:
        return
    ps = getattr(order, "picking_session_id", None)
    if ps is None or int(ps) <= 0:
        return
    sess = (
        db.query(WmsOperationSession)
        .filter(
            WmsOperationSession.id == int(ps),
            WmsOperationSession.cart_id.is_(None),
            WmsOperationSession.session_kind == SESSION_KIND_PICKING_ACTIVE,
            WmsOperationSession.completed_at.is_(None),
        )
        .first()
    )
    if sess is None:
        return
    source_sid = session_source_status_id(sess)
    if source_sid is None:
        return
    if new_status_id is not None and int(new_status_id) == int(source_sid):
        return
    if order_has_cartless_picking_progress(db, order_id=int(order.id)):
        from ..cart_picking_lifecycle_service import CartLifecycleError

        raise CartLifecycleError(
            CARTLESS_STATUS_CHANGE_BLOCKED_MSG,
            code="CartlessPickingInProgress",
        )


def sync_cartless_membership_on_panel_status_change(
    db: Session,
    *,
    order: Order,
    previous_status_id: int | None,
    new_status_id: int | None,
    operator_user_id: int | None = None,
) -> dict[str, Any]:
    """
    Panel status left the cartless session source status:

    - no factual picks → release from session (ERP status wins),
    - picks exist → must be blocked earlier via ``assert_cartless_panel_status_change_allowed``.
    """
    _ = previous_status_id
    if getattr(order, "cart_id", None) is not None:
        return {"action": "skip_has_cart"}

    ps = getattr(order, "picking_session_id", None)
    if ps is None or int(ps) <= 0:
        return {"action": "skip_not_on_session"}

    sess = (
        db.query(WmsOperationSession)
        .filter(
            WmsOperationSession.id == int(ps),
            WmsOperationSession.cart_id.is_(None),
            WmsOperationSession.session_kind == SESSION_KIND_PICKING_ACTIVE,
            WmsOperationSession.completed_at.is_(None),
        )
        .first()
    )
    if sess is None:
        return {"action": "skip_session_closed"}

    source_sid = session_source_status_id(sess)
    if source_sid is None:
        return {"action": "skip_no_source_status"}

    if new_status_id is not None and int(new_status_id) == int(source_sid):
        return {"action": "keep_in_source"}

    # Defense in depth — should already be asserted before status mutation.
    assert_cartless_panel_status_change_allowed(
        db, order=order, new_status_id=new_status_id
    )

    released = release_order_from_cartless_session(
        db,
        order=order,
        reason="panel_status_left_source",
        operator_user_id=operator_user_id,
        preserve_panel_status=True,
    )
    return {"action": "released", **released}


def revalidate_cartless_session_membership(
    db: Session,
    *,
    session_id: int,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int | None = None,
    operator_user_id: int | None = None,
) -> list[int]:
    """
    Before product-list / pick / finalize: release members that left the session
    source status and have no picks. Returns remaining order ids still belonging
    to ``source_status_id`` (session meta if omitted).
    """
    sess = (
        db.query(WmsOperationSession)
        .filter(
            WmsOperationSession.id == int(session_id),
            WmsOperationSession.tenant_id == int(tenant_id),
            WmsOperationSession.warehouse_id == int(warehouse_id),
            WmsOperationSession.cart_id.is_(None),
            WmsOperationSession.session_kind == SESSION_KIND_PICKING_ACTIVE,
        )
        .first()
    )
    if sess is None:
        return []

    sid = int(source_status_id) if source_status_id is not None else session_source_status_id(sess)
    if sid is None:
        from .scope import list_order_ids_on_picking_session

        return list_order_ids_on_picking_session(
            db,
            session_id=int(session_id),
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
        )

    orders = (
        db.query(Order)
        .filter(
            Order.picking_session_id == int(session_id),
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            Order.deleted_at.is_(None),
        )
        .order_by(Order.id.asc())
        .all()
    )
    kept: list[int] = []
    stale: list[Order] = []
    for o in orders:
        if order_belongs_to_picking_session_source(
            o, session_id=int(session_id), source_status_id=int(sid)
        ):
            kept.append(int(o.id))
        else:
            stale.append(o)

    progress_ids: set[int] = set()
    if stale:
        stale_ids = [int(o.id) for o in stale]
        progress_rows = (
            db.query(Pick.order_id)
            .filter(
                Pick.order_id.in_(stale_ids),
                Pick.cart_id.is_(None),
                Pick.status.in_(("done", "picking", "waiting")),
            )
            .distinct()
            .all()
        )
        progress_ids = {int(r[0]) for r in progress_rows if r[0] is not None}

    for o in stale:
        oid = int(o.id)
        if oid in progress_ids:
            # Keep row for conflict visibility but exclude from operational scope.
            logger.warning(
                "cartless.membership.stale_with_picks order_id=%s session_id=%s "
                "order_status=%s source_status_id=%s",
                oid,
                int(session_id),
                getattr(o, "order_ui_status_id", None),
                sid,
            )
            continue
        release_order_from_cartless_session(
            db,
            order=o,
            reason="revalidate_status_mismatch",
            operator_user_id=operator_user_id,
            preserve_panel_status=True,
        )
    return kept
