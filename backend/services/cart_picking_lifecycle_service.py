"""
CartLifecycleService — jedyny SSOT cyklu życia wózka.

AVAILABLE → claimCart → ASSIGNED → startPicking (skan) → PICKING
  → finishPicking → READY_FOR_PACKING → startPacking (skan pakowacza) → PACKING
  → finishPacking (ostatnie) → AVAILABLE

ASSIGNED = operator wybrał wózek; BEZ zamówień, BEZ sesji, BEZ current_session_id.
Przypisanie order.cart_id wyłącznie w startPicking (po fizycznym skanie).

Żaden inny serwis nie zapisuje: carts.status, current_session_id,
orders.cart_id, assigned_user_id, packing_user_id.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Literal, Optional, Sequence

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
PICKING_IN_PROGRESS = FS_PICKING

CapacityPolicy = Literal["truncate", "error"]


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


class InvalidCartTransitionError(CartLifecycleError):
    def __init__(self, message: str, *, from_status: str | None = None, to_status: str | None = None):
        super().__init__(message, code="InvalidCartTransition")
        self.from_status = from_status
        self.to_status = to_status


# ---------------------------------------------------------------------------
# Status helpers (read / write — write only via this module)
# ---------------------------------------------------------------------------


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
    """Internal — only CartLifecycleService transitions."""
    cart.status = status.value


def _require_status(cart: Cart, allowed: Sequence[CartStatus], *, action: str) -> CartStatus:
    cur = get_cart_status(cart)
    if cur not in allowed:
        raise InvalidCartTransitionError(
            f"Nie można wykonać {action}: status wózka to {cur.value}, "
            f"oczekiwano {[s.value for s in allowed]}.",
            from_status=cur.value,
        )
    return cur


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


def find_open_picking_session(db: Session, *, cart: Cart) -> WmsOperationSession | None:
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


def _orders_on_cart(db: Session, cart_id: int) -> list[Order]:
    return (
        db.query(Order)
        .filter(Order.cart_id == int(cart_id), Order.deleted_at.is_(None))
        .all()
    )


def _apply_capacity_slice(
    db: Session,
    cart: Cart,
    candidates: Sequence[Order],
    *,
    on_capacity: CapacityPolicy,
) -> list[Order]:
    """
    Walidacja pojemności wyłącznie przy starcie PICKING.
    truncate: weź max ile się mieści; error: CartCapacityExceeded / ValueError.
    """
    from .cart_capacity_service import (
        CartCapacityExceeded,
        assert_cart_orders_capacity,
        count_orders_on_cart,
        normalize_capacity_mode,
    )

    cand = list(candidates)
    if not cand:
        return []

    mode = normalize_capacity_mode(getattr(cart, "capacity_mode", None))
    current = count_orders_on_cart(db, int(cart.id))

    if mode == "orders":
        max_orders = getattr(cart, "max_orders", None)
        if max_orders is not None:
            room = max(0, int(max_orders) - current)
            if len(cand) > room:
                if on_capacity == "error" or room <= 0:
                    raise CartCapacityExceeded(
                        current_orders=current,
                        max_orders=int(max_orders),
                        attempted=len(cand),
                    )
                cand = cand[:room]

    if mode in ("volume", "mixed"):
        cap = float(getattr(cart, "total_volume", None) or 0)
        if cap > 0:
            used = float(getattr(cart, "used_volume", None) or 0)
            kept: list[Order] = []
            for o in cand:
                vol = float(getattr(o, "total_volume_dm3", None) or 0)
                if used + vol > cap + 1e-9:
                    if on_capacity == "error" and not kept:
                        raise CartLifecycleError(
                            f"Objętość zamówień przekracza pojemność wózka "
                            f"({used + vol:.1f} > {cap:.1f} dm³).",
                            code="CART_CAPACITY_EXCEEDED",
                        )
                    if on_capacity == "error":
                        break
                    break
                kept.append(o)
                used += vol
            if on_capacity == "error" and len(kept) < len(cand) and not kept:
                raise CartLifecycleError(
                    "Żadne zamówienie nie mieści się w pojemności objętościowej wózka.",
                    code="CART_CAPACITY_EXCEEDED",
                )
            cand = kept if mode == "volume" or kept else cand

    # Ponowna twarda asercja orders (gdy truncate zostawił ok)
    if mode == "orders" and cand:
        try:
            assert_cart_orders_capacity(
                cart,
                current_orders=current,
                incoming_orders=len(cand),
            )
        except CartCapacityExceeded:
            raise
    return cand


# ---------------------------------------------------------------------------
# Public API — CartLifecycleService
# ---------------------------------------------------------------------------


def claim_cart(
    db: Session,
    *,
    cart: Cart,
    operator_user_id: int,
) -> Cart:
    """
    AVAILABLE → ASSIGNED.

    Operator wybrał wózek. Bez zamówień, bez sesji, bez current_session_id.
    """
    uid = int(operator_user_id)
    if uid <= 0:
        raise CartLifecycleError("Wymagany operator.", code="operator_required")

    st = get_cart_status(cart)
    if st == CartStatus.ASSIGNED:
        existing = getattr(cart, "assigned_user_id", None)
        if existing is not None and int(existing) != uid:
            raise InvalidCartStateError(
                "Wózek jest już wybrany przez innego operatora.",
                status=st.value,
            )
        cart.assigned_user_id = uid
        db.add(cart)
        db.flush()
        return cart

    _require_status(cart, (CartStatus.AVAILABLE,), action="claimCart")

    orphans = _orders_on_cart(db, int(cart.id))
    if orphans:
        # Dane niespójne względem nowego modelu — wyczyść occupancy przed claim.
        for o in orphans:
            clear_order_picking_session_context(o)
            db.add(o)
        logger.warning(
            "cart_lifecycle.claim_cleared_orphans cart_id=%s count=%s",
            int(cart.id),
            len(orphans),
        )

    set_cart_status(cart, CartStatus.ASSIGNED)
    cart.assigned_user_id = uid
    cart.current_session_id = None
    if hasattr(cart, "packing_user_id"):
        cart.packing_user_id = None
    if hasattr(cart, "started_at"):
        cart.started_at = None
    db.add(cart)
    db.flush()
    logger.info(
        "cart_lifecycle.claim cart_id=%s operator=%s status=ASSIGNED",
        int(cart.id),
        uid,
    )
    return cart


def start_picking(
    db: Session,
    *,
    cart: Cart,
    orders: Sequence[Order],
    operator_user_id: int,
    source_status_id: int | None = None,
    on_capacity: CapacityPolicy = "truncate",
) -> WmsOperationSession:
    """
    Jedyny moment: tworzy sesję, przypisuje zamówienia, PICKING.

    Wejście: ASSIGNED (po claim) lub AVAILABLE (claim+start w jednej transakcji).
    Capacity walidowana tutaj — nie wcześniej.
    """
    uid = int(operator_user_id)
    if uid <= 0:
        raise CartLifecycleError("Wymagany operator.", code="operator_required")

    st = get_cart_status(cart)
    if st == CartStatus.PICKING:
        sess = find_open_picking_session(db, cart=cart)
        if sess is not None:
            return sess
        raise SessionNotFoundError("Status PICKING bez aktywnej sesji — użyj cancel lub heal.")

    if st == CartStatus.AVAILABLE:
        claim_cart(db, cart=cart, operator_user_id=uid)
        st = get_cart_status(cart)

    _require_status(cart, (CartStatus.ASSIGNED,), action="startPicking")

    # ASSIGNED: nie wolno mieć już order.cart_id
    existing = _orders_on_cart(db, int(cart.id))
    if existing:
        for o in existing:
            clear_order_picking_session_context(o)
            db.add(o)
        logger.warning(
            "cart_lifecycle.start_cleared_premature_orders cart_id=%s count=%s",
            int(cart.id),
            len(existing),
        )

    free_candidates = [
        o
        for o in orders
        if getattr(o, "cart_id", None) is None
        or int(o.cart_id) == int(cart.id)
    ]
    # Zamówienia na innych wózkach — pomiń
    free_candidates = [o for o in free_candidates if getattr(o, "cart_id", None) is None]

    selected = _apply_capacity_slice(db, cart, free_candidates, on_capacity=on_capacity)
    if not selected and free_candidates:
        from .cart_capacity_service import CartCapacityExceeded

        raise CartCapacityExceeded(
            current_orders=0,
            max_orders=int(getattr(cart, "max_orders", None) or 0),
            attempted=len(free_candidates),
        )
    if not selected:
        raise CartLifecycleError(
            "Brak zamówień do przypisania przy starcie zbierania.",
            code="no_orders_to_assign",
        )

    now = datetime.utcnow()
    cid = int(cart.id)
    tid = int(cart.tenant_id)
    wid = int(cart.warehouse_id)
    snapshots = [_order_snapshot(o) for o in selected]
    meta = {
        "orders_snapshot": snapshots,
        "source_status_id": int(source_status_id) if source_status_id else None,
        "cart_id": cid,
    }

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

    sid = int(sess.id)
    set_cart_status(cart, CartStatus.PICKING)
    cart.current_session_id = sid
    cart.assigned_user_id = uid
    cart.started_at = now
    if hasattr(cart, "packing_user_id"):
        cart.packing_user_id = None

    used_vol = 0.0
    for o in selected:
        o.cart_id = cid
        # Legacy kolumna — ustawiana tylko tutaj; docelowo do usunięcia
        if hasattr(o, "picking_session_id"):
            o.picking_session_id = sid
        on_picking_started(o)
        fs = (getattr(o, "fulfillment_state", None) or "").strip().upper()
        if fs in ("", FS_PICKING, "PARTIAL"):
            o.fulfillment_state = PICKING_IN_PROGRESS
        if getattr(o, "picking_started_at", None) is None:
            o.picking_started_at = now
        st_o = (getattr(o, "status", None) or "").strip().upper()
        if st_o in ("", "NEW", "ASSIGNED", "READY"):
            o.status = "PICKING_IN_PROGRESS"
        used_vol += float(getattr(o, "total_volume_dm3", None) or 0)
        db.add(o)

    cart.used_volume = round(used_vol, 2)
    db.add(cart)
    db.flush()
    logger.info(
        "cart_lifecycle.start_picking cart_id=%s session_id=%s orders=%s operator=%s",
        cid,
        sid,
        [int(o.id) for o in selected],
        uid,
    )
    return sess


def cancel_picking(
    db: Session,
    *,
    cart_id: int,
    tenant_id: int,
    warehouse_id: int,
    operator_user_id: int | None = None,
) -> dict[str, Any]:
    """Anuluj tylko z ASSIGNED | PICKING → AVAILABLE."""
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

    st = get_cart_status(cart)
    if st in (CartStatus.READY_FOR_PACKING, CartStatus.PACKING):
        raise InvalidCartTransitionError(
            "Nie można anulować zbierania po READY_FOR_PACKING / PACKING. "
            "Wymagany osobny proces Reopen Picking.",
            from_status=st.value,
        )
    _require_status(cart, (CartStatus.ASSIGNED, CartStatus.PICKING), action="cancelPicking")

    sess = find_open_picking_session(db, cart=cart)
    meta = _load_meta(getattr(sess, "metadata_json", None) if sess else None)
    snaps = meta.get("orders_snapshot") if isinstance(meta.get("orders_snapshot"), list) else []
    snap_by_id = {
        int(s["order_id"]): s
        for s in snaps
        if isinstance(s, dict) and s.get("order_id") is not None
    }

    orders = _orders_on_cart(db, int(cart_id))
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
            if (getattr(o, "status", None) or "").upper() == "PICKING_IN_PROGRESS":
                o.status = "NEW"
            if (getattr(o, "fulfillment_state", None) or "").upper() == FS_PICKING:
                o.fulfillment_state = None
        o.picking_started_at = None
        db.add(o)
        restored += 1

    if sess is not None and sess.completed_at is None:
        now = datetime.utcnow()
        sess.completed_at = now
        sess.last_activity_at = now
        sess.completed_reason = "cancelled"
        db.add(sess)

    release_cart(db, cart=cart, reason="cancel_picking")
    db.flush()
    logger.info("cart_lifecycle.cancel cart_id=%s restored=%s", int(cart_id), restored)
    return {
        "cart_id": int(cart_id),
        "orders_restored": restored,
        "cart_status": CartStatus.AVAILABLE.value,
    }


def finish_picking(
    db: Session,
    *,
    cart: Cart,
    orders: Sequence[Order] | None = None,
    operator_user_id: int | None = None,
) -> None:
    """
    PICKING → READY_FOR_PACKING.
    cart_id zostaje; assigned_user zostaje; current_session_id czyszczone po close sesji.
    """
    _require_status(cart, (CartStatus.PICKING,), action="finishPicking")
    cid = int(cart.id)
    order_list = list(orders) if orders is not None else _orders_on_cart(db, cid)
    if not order_list:
        raise CartLifecycleError("Brak zamówień na wózku do domknięcia zbierania.", code="no_orders")

    for o in order_list:
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

    sess = find_open_picking_session(db, cart=cart)
    now = datetime.utcnow()
    if sess is not None and sess.completed_at is None:
        sess.completed_at = now
        sess.last_activity_at = now
        sess.completed_reason = "picking_finished"
        db.add(sess)

    set_cart_status(cart, CartStatus.READY_FOR_PACKING)
    cart.current_session_id = None
    # assigned_user_id ZOSTAJE (wymaganie biznesowe)
    db.add(cart)
    db.flush()
    logger.info(
        "cart_lifecycle.finish_picking cart_id=%s orders=%s assigned_user=%s",
        cid,
        [int(o.id) for o in order_list],
        getattr(cart, "assigned_user_id", None),
    )


def start_packing(
    db: Session,
    *,
    cart: Cart,
    operator_user_id: int,
) -> Cart:
    """
    READY_FOR_PACKING → PACKING (skan wózka przez pakowacza).
    assigned_user = NULL; packing_user = operator.
    """
    uid = int(operator_user_id)
    if uid <= 0:
        raise CartLifecycleError("Wymagany operator pakujący.", code="operator_required")

    st = get_cart_status(cart)
    if st == CartStatus.PACKING:
        if hasattr(cart, "packing_user_id"):
            cart.packing_user_id = uid
        cart.assigned_user_id = None
        db.add(cart)
        db.flush()
        return cart

    _require_status(cart, (CartStatus.READY_FOR_PACKING,), action="startPacking")

    set_cart_status(cart, CartStatus.PACKING)
    cart.assigned_user_id = None
    if hasattr(cart, "packing_user_id"):
        cart.packing_user_id = uid
    db.add(cart)
    db.flush()
    logger.info(
        "cart_lifecycle.start_packing cart_id=%s packing_user=%s",
        int(cart.id),
        uid,
    )
    return cart


def finish_packing(
    db: Session,
    *,
    cart: Cart,
    packed_order_id: int,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
) -> bool:
    """
    Odpina spakowane zamówienie. Gdy ostatnie → releaseCart → AVAILABLE.
    Zwraca True gdy wózek zwolniony.
    """
    st = get_cart_status(cart)
    if st not in (CartStatus.PACKING, CartStatus.READY_FOR_PACKING):
        # Tolerancja: jeśli ktoś spakował bez skanu — wymuś PACKING tylko przez start_packing
        raise InvalidCartTransitionError(
            f"finishPacking wymaga PACKING (jest {st.value}). Najpierw skan wózka (startPacking).",
            from_status=st.value,
        )

    cid = int(cart.id)
    packed = db.query(Order).filter(Order.id == int(packed_order_id)).first()
    if packed is not None:
        packed.cart_id = None
        packed.basket_id = None
        if hasattr(packed, "picking_session_id"):
            packed.picking_session_id = None
        db.add(packed)

    remaining = (
        db.query(Order)
        .filter(Order.cart_id == cid, Order.id != int(packed_order_id), Order.deleted_at.is_(None))
        .count()
    )
    if remaining > 0:
        if st != CartStatus.PACKING:
            set_cart_status(cart, CartStatus.PACKING)
            db.add(cart)
        db.flush()
        return False

    release_cart(db, cart=cart, reason="last_order_packed")
    return True


def release_cart(db: Session, *, cart: Cart, reason: str = "release") -> None:
    """Pełny reset → AVAILABLE."""
    for basket in list(cart.baskets or []):
        basket.order_id = None
        basket.used_volume = 0.0
        db.add(basket)
    cart.used_volume = 0.0
    set_cart_status(cart, CartStatus.AVAILABLE)
    cart.assigned_user_id = None
    cart.current_session_id = None
    if hasattr(cart, "packing_user_id"):
        cart.packing_user_id = None
    if hasattr(cart, "started_at"):
        cart.started_at = None
    db.add(cart)
    logger.info("cart_lifecycle.release cart_id=%s reason=%s", int(cart.id), reason)


# ---------------------------------------------------------------------------
# Guards / heal (read + heal only within this module)
# ---------------------------------------------------------------------------


def assert_cart_ready_for_quick_pick(db: Session, cart: Cart) -> WmsOperationSession:
    """Quick-pick tylko gdy PICKING + otwarta sesja (bez tworzenia sesji)."""
    st = get_cart_status(cart)
    if st != CartStatus.PICKING:
        raise InvalidCartStateError(
            f"Wózek musi być w stanie PICKING (jest: {st.value}). "
            "Najpierw zeskanuj wózek (startPicking).",
            status=st.value,
        )
    sess = find_open_picking_session(db, cart=cart)
    if sess is None:
        raise SessionNotFoundError()
    if getattr(cart, "current_session_id", None) is None:
        cart.current_session_id = int(sess.id)
        db.add(cart)
        db.flush()
    return sess


def heal_carts_with_orphaned_picking_sessions(db: Session) -> int:
    """
    Open picking session ⇒ cart musi być PICKING + current_session_id.
    Nie tworzy sesji. Nie rusza READY_FOR_PACKING / PACKING.
    """
    open_sessions = (
        db.query(WmsOperationSession)
        .filter(
            WmsOperationSession.completed_at.is_(None),
            WmsOperationSession.cart_id.isnot(None),
            WmsOperationSession.session_kind.in_(
                (SESSION_KIND_PICKING_ACTIVE, "picking_recovery_active")
            ),
        )
        .order_by(WmsOperationSession.id.desc())
        .all()
    )
    best_by_cart: dict[int, WmsOperationSession] = {}
    for sess in open_sessions:
        cid = int(sess.cart_id)
        if cid not in best_by_cart:
            best_by_cart[cid] = sess

    healed = 0
    for cid, sess in best_by_cart.items():
        cart = db.query(Cart).filter(Cart.id == cid).first()
        if cart is None:
            continue
        st = get_cart_status(cart)
        if st in (
            CartStatus.READY_FOR_PACKING,
            CartStatus.PACKING,
            CartStatus.FULL,
            CartStatus.SERVICE,
        ):
            continue
        cur_sid = getattr(cart, "current_session_id", None)
        if st != CartStatus.PICKING or cur_sid is None or int(cur_sid or 0) != int(sess.id):
            set_cart_status(cart, CartStatus.PICKING)
            cart.current_session_id = int(sess.id)
            if getattr(cart, "assigned_user_id", None) is None and getattr(sess, "operator_user_id", None):
                cart.assigned_user_id = int(sess.operator_user_id)
            if getattr(cart, "started_at", None) is None:
                cart.started_at = getattr(sess, "started_at", None) or datetime.utcnow()
            db.add(cart)
            healed += 1
            logger.warning(
                "cart_lifecycle.self_heal cart_id=%s → PICKING session_id=%s",
                cid,
                int(sess.id),
            )
    if healed:
        db.commit()
    return healed


def compute_session_stats_from_product_lines(lines: Sequence[Any]) -> dict[str, int]:
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
    return {"zebrane": zebrane, "do_zebrania": do_zebrania, "w_trakcie": w_trakcie}


# ---------------------------------------------------------------------------
# Backward-compatible aliases (deprecated names → new API)
# ---------------------------------------------------------------------------

# Public names matching approved design
assignOrders = None  # removed: orders assigned only inside start_picking
claimCart = claim_cart
startPicking = start_picking
cancelPicking = cancel_picking
finishPicking = finish_picking
startPacking = start_packing
finishPacking = finish_packing
releaseCart = release_cart


def cancel_picking_session(*args, **kwargs):
    return cancel_picking(*args, **kwargs)


def complete_picking_keep_cart(db: Session, *, cart: Cart, orders: Sequence[Order], operator_user_id: int | None = None) -> None:
    finish_picking(db, cart=cart, orders=orders, operator_user_id=operator_user_id)


def release_cart_to_available(db: Session, cart: Cart, *, reason: str = "release") -> None:
    release_cart(db, cart=cart, reason=reason)


def release_cart_after_last_order_packed(
    db: Session,
    *,
    cart_id: int | None,
    tenant_id: int,
    warehouse_id: int,
    packed_order_id: int,
) -> bool:
    if cart_id is None or int(cart_id) <= 0:
        return False
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
        return False
    # Jeśli jeszcze READY_FOR_PACKING — nie przechodź automatycznie; finish_packing wymaga PACKING.
    # Dla kompatybilności ścieżki finish order: jeśli READY, najpierw wymuś PACKING bez usera (legacy).
    st = get_cart_status(cart)
    if st == CartStatus.READY_FOR_PACKING:
        set_cart_status(cart, CartStatus.PACKING)
        db.add(cart)
        db.flush()
    return finish_packing(
        db,
        cart=cart,
        packed_order_id=int(packed_order_id),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
    )


def mark_cart_packing(cart: Cart) -> None:
    """Deprecated — użyj start_packing. Zostawione tylko jako no-op guard."""
    cur = get_cart_status(cart)
    if cur == CartStatus.READY_FOR_PACKING:
        set_cart_status(cart, CartStatus.PACKING)


def mark_cart_picking(cart: Cart) -> None:
    """Deprecated — użyj start_picking."""
    cur = get_cart_status(cart)
    if cur in (CartStatus.AVAILABLE, CartStatus.ASSIGNED, CartStatus.PICKING):
        set_cart_status(cart, CartStatus.PICKING)


def bind_cart_to_picking_session(
    db: Session,
    cart: Cart,
    sess: WmsOperationSession,
    *,
    operator_user_id: int | None = None,
    force_picking: bool = True,
) -> None:
    """Internal heal only — nie tworzy sesji ani nie przypisuje zamówień."""
    now = datetime.utcnow()
    sid = int(sess.id)
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    cart.current_session_id = sid
    if uid is not None:
        cart.assigned_user_id = uid
    elif getattr(sess, "operator_user_id", None) is not None:
        cart.assigned_user_id = int(sess.operator_user_id)
    if force_picking:
        set_cart_status(cart, CartStatus.PICKING)
    if getattr(cart, "started_at", None) is None:
        cart.started_at = getattr(sess, "started_at", None) or now
    db.add(cart)


def ensure_picking_session_for_cart(
    db: Session,
    *,
    cart: Cart,
    orders: Sequence[Order],
    operator_user_id: int | None = None,
    source_status_id: int | None = None,
) -> WmsOperationSession:
    """
    REMOVED as public assign path.

    Raises — callers must use start_picking after claim.
    Kept temporarily to fail loudly if old path still invoked.
    """
    raise CartLifecycleError(
        "ensure_picking_session_for_cart usunięte. "
        "Użyj claim_cart + start_picking (skan wózka).",
        code="legacy_ensure_forbidden",
    )
