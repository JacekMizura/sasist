"""
SSOT: cykl życia wózka + sesja zbierania powiązana z zamówieniami.

AVAILABLE → ASSIGNED → PICKING → READY_FOR_PACKING → PACKING → AVAILABLE

Źródło prawdy: backend (Order.cart_id / picking_session_id / fulfillment_state + Cart.status).
Frontend tylko projekcja — bez lokalnych liczników jako prawdy.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Optional, Sequence

from sqlalchemy.orm import Session, joinedload

from ..models.cart import Cart
from ..models.enums import CartStatus, normalize_cart_status_value
from ..models.order import Order
from ..models.wms_operation_session import WmsOperationSession
from .order_fulfillment_lifecycle_service import on_picking_started
from .order_fulfillment_state import (
    PACKING as FS_PACKING,
    PICKING as FS_PICKING,
    apply_fulfillment_state,
    clear_order_picking_session_context,
)

logger = logging.getLogger(__name__)

SESSION_KIND_PICKING_ACTIVE = "picking_active"

# Alias użytkownika: PICKING_IN_PROGRESS ≡ fulfillment_state PICKING
PICKING_IN_PROGRESS = FS_PICKING


class CartLifecycleError(ValueError):
    def __init__(self, message: str, *, code: str = "cart_lifecycle_error"):
        super().__init__(message)
        self.code = code
        self.message = message


class SessionNotFoundError(CartLifecycleError):
    def __init__(self, message: str = "Brak aktywnej sesji zbierania dla wózka."):
        super().__init__(message, code="SessionNotFound")


class InvalidCartStateError(CartLifecycleError):
    def __init__(self, message: str, *, status: str | None = None):
        super().__init__(message, code="InvalidCartState")
        self.cart_status = status


def _status_enum(value: str) -> CartStatus:
    canon = normalize_cart_status_value(value)
    for st in CartStatus:
        if st.value == canon:
            return st
    return CartStatus.AVAILABLE


def get_cart_status(cart: Cart) -> CartStatus:
    raw = getattr(cart, "status", None)
    if isinstance(raw, CartStatus):
        return _status_enum(raw.value)
    if raw is None:
        return CartStatus.AVAILABLE
    return _status_enum(str(getattr(raw, "value", raw)))


def set_cart_status(cart: Cart, status: CartStatus) -> None:
    cart.status = status.value


def find_open_picking_session(
    db: Session,
    *,
    cart: Cart,
) -> WmsOperationSession | None:
    """Aktywna sesja picking_active: current_session_id lub ostatnia otwarta dla wózka."""
    cid = int(cart.id)
    sid = getattr(cart, "current_session_id", None)
    if sid is not None and int(sid) > 0:
        sess = (
            db.query(WmsOperationSession)
            .filter(
                WmsOperationSession.id == int(sid),
                WmsOperationSession.completed_at.is_(None),
            )
            .first()
        )
        if sess is not None:
            return sess
    return (
        db.query(WmsOperationSession)
        .filter(
            WmsOperationSession.cart_id == cid,
            WmsOperationSession.session_kind.in_(
                (SESSION_KIND_PICKING_ACTIVE, "picking_recovery_active")
            ),
            WmsOperationSession.completed_at.is_(None),
        )
        .order_by(WmsOperationSession.id.desc())
        .first()
    )


def assert_cart_ready_for_quick_pick(db: Session, cart: Cart) -> WmsOperationSession:
    """
    SSOT przed quick-pick:
    - cart.status musi być PICKING (legacy „w trakcie zbierania” też OK),
    - musi istnieć otwarta picking_session + cart.current_session_id.
    """
    st = get_cart_status(cart)
    if st != CartStatus.PICKING:
        raise InvalidCartStateError(
            f"Wózek musi być w stanie PICKING (jest: {st.value}).",
            status=st.value,
        )
    sess = find_open_picking_session(db, cart=cart)
    if sess is None:
        raise SessionNotFoundError()
    cur_sid = getattr(cart, "current_session_id", None)
    if cur_sid is None or int(cur_sid) != int(sess.id):
        cart.current_session_id = int(sess.id)
        db.add(cart)
    return sess


def _dump_meta(data: dict[str, Any] | None) -> str | None:
    if not data:
        return None
    try:
        return json.dumps(data, ensure_ascii=False)
    except Exception:
        return None


def _load_meta(raw: str | None) -> dict[str, Any]:
    if not raw or not str(raw).strip():
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _order_snapshot(order: Order) -> dict[str, Any]:
    return {
        "order_id": int(order.id),
        "status": getattr(order, "status", None),
        "fulfillment_state": getattr(order, "fulfillment_state", None),
        "order_ui_status_id": getattr(order, "order_ui_status_id", None),
        "basket_id": getattr(order, "basket_id", None),
        "fulfillment_assignment_phase": getattr(order, "fulfillment_assignment_phase", None),
    }


def ensure_picking_session_for_cart(
    db: Session,
    *,
    cart: Cart,
    orders: Sequence[Order],
    operator_user_id: int | None = None,
    source_status_id: int | None = None,
) -> WmsOperationSession:
    """
    Po przypisaniu zamówień do wózka:
    - utwórz / odśwież picking_session (WmsOperationSession.picking_active),
    - ustaw order.cart_id, order.picking_session_id,
    - fulfillment_state = PICKING (PICKING_IN_PROGRESS),
    - cart.status = ASSIGNED → PICKING.
    """
    cid = int(cart.id)
    tid = int(cart.tenant_id)
    wid = int(cart.warehouse_id)
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    now = datetime.utcnow()

    sess: WmsOperationSession | None = None
    if getattr(cart, "current_session_id", None):
        sess = (
            db.query(WmsOperationSession)
            .filter(
                WmsOperationSession.id == int(cart.current_session_id),
                WmsOperationSession.completed_at.is_(None),
            )
            .first()
        )

    if sess is None:
        q = db.query(WmsOperationSession).filter(
            WmsOperationSession.tenant_id == tid,
            WmsOperationSession.warehouse_id == wid,
            WmsOperationSession.cart_id == cid,
            WmsOperationSession.session_kind == SESSION_KIND_PICKING_ACTIVE,
            WmsOperationSession.completed_at.is_(None),
        )
        if uid is not None:
            q = q.filter(WmsOperationSession.operator_user_id == uid)
        sess = q.order_by(WmsOperationSession.id.desc()).first()

    snapshots = [_order_snapshot(o) for o in orders]
    meta = {
        "orders_snapshot": snapshots,
        "source_status_id": int(source_status_id) if source_status_id else None,
        "cart_id": cid,
    }

    if sess is None:
        sess = WmsOperationSession(
            tenant_id=tid,
            warehouse_id=wid,
            cart_id=cid,
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
    else:
        existing = _load_meta(getattr(sess, "metadata_json", None))
        prev_snaps = existing.get("orders_snapshot") if isinstance(existing.get("orders_snapshot"), list) else []
        known_ids = {int(s["order_id"]) for s in prev_snaps if isinstance(s, dict) and s.get("order_id") is not None}
        for snap in snapshots:
            if int(snap["order_id"]) not in known_ids:
                prev_snaps.append(snap)
        existing["orders_snapshot"] = prev_snaps
        if source_status_id is not None:
            existing["source_status_id"] = int(source_status_id)
        existing["cart_id"] = cid
        sess.metadata_json = _dump_meta(existing)
        sess.last_activity_at = now
        if uid is not None and sess.operator_user_id is None:
            sess.operator_user_id = uid
        db.add(sess)
        db.flush()

    sid = int(sess.id)
    cart.current_session_id = sid
    if uid is not None:
        cart.assigned_user_id = uid

    cur = get_cart_status(cart)
    if cur in (CartStatus.AVAILABLE, CartStatus.ASSIGNED):
        # Pierwsze przypisanie → ASSIGNED, od razu PICKING gdy są zamówienia
        set_cart_status(cart, CartStatus.PICKING if orders else CartStatus.ASSIGNED)
    elif cur == CartStatus.AVAILABLE:
        set_cart_status(cart, CartStatus.ASSIGNED)

    for o in orders:
        o.cart_id = cid
        o.picking_session_id = sid
        on_picking_started(o)
        fs = (getattr(o, "fulfillment_state", None) or "").strip().upper()
        if fs in ("", FS_PICKING, "PARTIAL"):
            o.fulfillment_state = PICKING_IN_PROGRESS
        if getattr(o, "picking_started_at", None) is None:
            o.picking_started_at = now
        # Legacy string status for operators / OMS filters
        st = (getattr(o, "status", None) or "").strip().upper()
        if st in ("", "NEW", "ASSIGNED", "READY"):
            o.status = "PICKING_IN_PROGRESS"
        db.add(o)

    db.add(cart)
    logger.info(
        "cart_lifecycle.ensure_session cart_id=%s session_id=%s orders=%s status=%s",
        cid,
        sid,
        [int(o.id) for o in orders],
        get_cart_status(cart).value,
    )
    return sess


def mark_cart_picking(cart: Cart) -> None:
    cur = get_cart_status(cart)
    if cur in (CartStatus.AVAILABLE, CartStatus.ASSIGNED, CartStatus.PICKING):
        set_cart_status(cart, CartStatus.PICKING)


def complete_picking_keep_cart(
    db: Session,
    *,
    cart: Cart,
    orders: Sequence[Order],
    operator_user_id: int | None = None,
) -> None:
    """
    Po zakończeniu zbierania: NIE odpinaj wózka.
    cart.status = READY_FOR_PACKING; order → PACKING (fulfillment + status string).
    """
    cid = int(cart.id)
    for o in orders:
        # Zachowaj cart_id + picking_session_id
        apply_fulfillment_state(
            o,
            FS_PACKING,
            clear_cart=False,
            clear_session=False,
            invoke_packing_lifecycle=False,
        )
        o.status = "PACKING"
        from .order_fulfillment_lifecycle_service import advance_fulfillment_assignment_phase
        from .fulfillment_assignment.phase_constants import PHASE_PACKING

        advance_fulfillment_assignment_phase(o, PHASE_PACKING)
        db.add(o)

    set_cart_status(cart, CartStatus.READY_FOR_PACKING)
    db.add(cart)

    # Domknij sesję picking_active (telemetria), ale current_session_id zostaje do zwolnienia po pakowaniu
    from .wms_audit_service import complete_wms_operation_session

    complete_wms_operation_session(
        db,
        tenant_id=int(cart.tenant_id),
        warehouse_id=int(cart.warehouse_id),
        session_kind=SESSION_KIND_PICKING_ACTIVE,
        operator_user_id=operator_user_id,
        cart_id=cid,
        completed_reason="picking_finished",
        metadata={"cart_id": cid, "orders": [int(o.id) for o in orders]},
    )
    logger.info(
        "cart_lifecycle.complete_picking cart_id=%s orders=%s status=%s",
        cid,
        [int(o.id) for o in orders],
        CartStatus.READY_FOR_PACKING.value,
    )


def mark_cart_packing(cart: Cart) -> None:
    cur = get_cart_status(cart)
    if cur in (CartStatus.READY_FOR_PACKING, CartStatus.PACKING, CartStatus.PICKING):
        set_cart_status(cart, CartStatus.PACKING)


def cancel_picking_session(
    db: Session,
    *,
    cart_id: int,
    tenant_id: int,
    warehouse_id: int,
    operator_user_id: int | None = None,
) -> dict[str, Any]:
    """
    Anuluj zbieranie: usuń cart_id / picking_session_id, przywróć poprzedni status, zwolnij wózek.
    """
    cart = (
        db.query(Cart)
        .options(joinedload(Cart.baskets))
        .filter(
            Cart.id == int(cart_id),
            Cart.tenant_id == int(tenant_id),
            Cart.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if cart is None:
        raise CartLifecycleError("Nie znaleziono wózka.", code="cart_not_found")

    sess = None
    if getattr(cart, "current_session_id", None):
        sess = db.query(WmsOperationSession).filter(WmsOperationSession.id == int(cart.current_session_id)).first()
    if sess is None:
        sess = (
            db.query(WmsOperationSession)
            .filter(
                WmsOperationSession.cart_id == int(cart_id),
                WmsOperationSession.session_kind == SESSION_KIND_PICKING_ACTIVE,
                WmsOperationSession.completed_at.is_(None),
            )
            .order_by(WmsOperationSession.id.desc())
            .first()
        )

    meta = _load_meta(getattr(sess, "metadata_json", None) if sess else None)
    snaps = meta.get("orders_snapshot") if isinstance(meta.get("orders_snapshot"), list) else []
    snap_by_id = {
        int(s["order_id"]): s
        for s in snaps
        if isinstance(s, dict) and s.get("order_id") is not None
    }

    orders = db.query(Order).filter(Order.cart_id == int(cart_id)).all()
    restored = 0
    for o in orders:
        snap = snap_by_id.get(int(o.id))
        clear_order_picking_session_context(o)
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
            # Brak snapshotu — bezpieczny rollback do stanu przed zbieraniem
            if (getattr(o, "status", None) or "").upper() == "PICKING_IN_PROGRESS":
                o.status = "NEW"
            if (getattr(o, "fulfillment_state", None) or "").upper() == FS_PICKING:
                o.fulfillment_state = None
        o.picking_started_at = None
        db.add(o)
        restored += 1

    release_cart_to_available(db, cart, reason="cancel_picking")

    if sess is not None and sess.completed_at is None:
        now = datetime.utcnow()
        sess.completed_at = now
        sess.last_activity_at = now
        sess.completed_reason = "cancelled"
        db.add(sess)

    from .wms_audit_service import complete_wms_operation_session

    complete_wms_operation_session(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        session_kind=SESSION_KIND_PICKING_ACTIVE,
        operator_user_id=operator_user_id,
        cart_id=int(cart_id),
        completed_reason="cancelled",
    )

    db.flush()
    logger.info(
        "cart_lifecycle.cancel cart_id=%s restored_orders=%s",
        int(cart_id),
        restored,
    )
    return {"cart_id": int(cart_id), "orders_restored": restored, "cart_status": CartStatus.AVAILABLE.value}


def release_cart_to_available(db: Session, cart: Cart, *, reason: str = "release") -> None:
    """Zwolnij wózek: AVAILABLE, bez operatora / sesji; wyczyść koszyki."""
    for basket in list(cart.baskets or []):
        basket.order_id = None
        basket.used_volume = 0.0
        db.add(basket)
    cart.used_volume = 0.0
    set_cart_status(cart, CartStatus.AVAILABLE)
    cart.assigned_user_id = None
    cart.current_session_id = None
    db.add(cart)
    logger.info("cart_lifecycle.release cart_id=%s reason=%s", int(cart.id), reason)


def release_cart_after_last_order_packed(
    db: Session,
    *,
    cart_id: int | None,
    tenant_id: int,
    warehouse_id: int,
    packed_order_id: int,
) -> bool:
    """
    Po spakowaniu zamówienia: jeśli na wózku nie ma już zamówień w cyklu,
    wyczyść cart_id/session na zamówieniu (już spakowanym) i zwolnij wózek.
    """
    if cart_id is None or int(cart_id) <= 0:
        return False
    cid = int(cart_id)

    packed = db.query(Order).filter(Order.id == int(packed_order_id)).first()
    if packed is not None:
        packed.cart_id = None
        packed.basket_id = None
        packed.picking_session_id = None
        db.add(packed)

    remaining = (
        db.query(Order)
        .filter(
            Order.cart_id == cid,
            Order.id != int(packed_order_id),
        )
        .count()
    )
    if remaining > 0:
        cart = db.query(Cart).filter(Cart.id == cid).first()
        if cart is not None:
            mark_cart_packing(cart)
            db.add(cart)
        return False

    cart = (
        db.query(Cart)
        .options(joinedload(Cart.baskets))
        .filter(
            Cart.id == cid,
            Cart.tenant_id == int(tenant_id),
            Cart.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if cart is None:
        return False
    release_cart_to_available(db, cart, reason="last_order_packed")
    return True


def compute_session_stats_from_product_lines(
    lines: Sequence[Any],
) -> dict[str, int]:
    """
    Liczniki Do zebrania / W trakcie / Zebrane — ta sama reguła co UI,
    liczona po stronie backendu na pełnej liście SKU sesji (przed filtrowaniem kolejki).
    """
    zebrane = 0
    do_zebrania = 0
    w_trakcie = 0
    for ln in lines:
        total = float(getattr(ln, "total_quantity", 0) or 0)
        picked = float(getattr(ln, "picked_quantity", 0) or 0)
        missing = float(getattr(ln, "missing_quantity", 0) or 0)
        remaining = float(getattr(ln, "remaining_to_pick", None) or 0)
        if remaining <= 1e-9 and (picked + missing + 1e-9 >= total or total <= 1e-9):
            zebrane += 1
        elif picked <= 1e-9:
            do_zebrania += 1
        else:
            w_trakcie += 1
    return {
        "zebrane": zebrane,
        "do_zebrania": do_zebrania,
        "w_trakcie": w_trakcie,
    }
