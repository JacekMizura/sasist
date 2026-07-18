"""
CartLifecycleService — jedyny SSOT cyklu życia wózka.

AVAILABLE → claimCart → ASSIGNED → startPicking (skan) → PICKING
  → finishPicking → READY_FOR_PACKING → startPacking (skan pakowacza) → PACKING
  → finishPacking (ostatnie) → AVAILABLE

ASSIGNED = operator wybrał wózek; BEZ zamówień, BEZ sesji, BEZ current_session_id.
Przypisanie order.cart_id wyłącznie w startPicking (po fizycznym skanie).

---------------------------------------------------------------------------
ARCHITEKTURA (nie łamać):

CartLifecycleService jest jedynym właścicielem lifecycle wózków.

Żaden nowy kod nie może bezpośrednio modyfikować:
  - carts.status
  - current_session_id
  - assigned_user / assigned_user_id
  - packing_user / packing_user_id
  - order.cart_id

Każda taka zmiana musi przechodzić przez CartLifecycleService.

Event Log (`cart_lifecycle_events`) — dziennik zdarzeń biznesowych po polsku —
zapisuje wyłącznie CartLifecycleService (`_record_event`).

Operacje mutujące są atomowe w transakcji wywołującego (flush, bez wewnętrznego commit).
Współbieżność: mutacje biorą SELECT … FOR UPDATE na wierszu carts.
---------------------------------------------------------------------------
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Literal, Optional, Sequence

from sqlalchemy.orm import Session, joinedload, selectinload

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


class CartAlreadyClaimedError(CartLifecycleError):
    def __init__(self, message: str = "Wózek jest już zarezerwowany przez innego operatora."):
        super().__init__(message, code="CartAlreadyClaimed")


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


def _counts_for_cart(db: Session, cart: Cart) -> tuple[int, int]:
    try:
        from .cart_stats_service import compute_cart_stats

        stats = compute_cart_stats(db, cart)
        return int(stats.get("orders_count") or 0), int(stats.get("products_count") or 0)
    except Exception:
        return 0, 0


def apply_cart_transition(
    db: Session,
    cart: Cart,
    new_status: CartStatus,
    *,
    operator_user_id: int | None,
    reason: str,
    task_id: int | None = None,
    batch_id: int | None = None,
    progress: float | None = None,
    total_orders: int | None = None,
    total_products: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """
    Jedyna brama zmiany carts.status + current_task + historii.
    """
    from .cart_lifecycle_extensions import (
        append_lifecycle_history,
        build_task_for_status,
        write_current_task,
    )

    prev = get_cart_status(cart)
    if prev != new_status:
        append_lifecycle_history(
            db,
            cart=cart,
            from_status=prev.value,
            to_status=new_status.value,
            operator_user_id=operator_user_id,
            reason=reason,
            task_type=new_status.value if new_status != CartStatus.AVAILABLE else None,
            task_id=task_id,
            batch_id=batch_id,
            metadata=metadata,
        )
        set_cart_status(cart, new_status)

    orders_n = total_orders
    products_n = total_products
    if orders_n is None or products_n is None:
        o2, p2 = _counts_for_cart(db, cart)
        if orders_n is None:
            orders_n = o2
        if products_n is None:
            products_n = p2

    prog = 0.0 if progress is None else float(progress)
    if new_status == CartStatus.READY_FOR_PACKING and progress is None:
        prog = 100.0
    picked_n, remaining_n = 0, int(products_n or 0)
    if new_status in (CartStatus.PICKING, CartStatus.READY_FOR_PACKING, CartStatus.PACKING):
        from .cart_lifecycle_extensions import compute_pick_progress

        picked_n, remaining_n, prog_live = compute_pick_progress(db, cart)
        if progress is None and new_status == CartStatus.PICKING:
            prog = prog_live
        if new_status == CartStatus.READY_FOR_PACKING:
            prog = 100.0
            remaining_n = 0
    if new_status == CartStatus.AVAILABLE:
        write_current_task(cart, None)
    else:
        op = operator_user_id
        if new_status == CartStatus.PACKING:
            op = getattr(cart, "packing_user_id", None) or operator_user_id
        elif new_status in (CartStatus.ASSIGNED, CartStatus.PICKING, CartStatus.READY_FOR_PACKING):
            op = getattr(cart, "assigned_user_id", None) or operator_user_id
        started = getattr(cart, "started_at", None)
        if new_status == CartStatus.ASSIGNED:
            started = getattr(cart, "claimed_at", None) or started or datetime.utcnow()
        task = build_task_for_status(
            status=new_status,
            operator_id=int(op) if op is not None else None,
            task_id=task_id if task_id is not None else getattr(cart, "current_session_id", None),
            batch_id=batch_id,
            started_at=started if isinstance(started, datetime) else datetime.utcnow(),
            progress=prog,
            total_orders=int(orders_n or 0),
            total_products=int(products_n or 0),
            picked_count=int(picked_n),
            remaining_count=int(remaining_n),
        )
        write_current_task(cart, task)
    db.add(cart)


def _require_status(cart: Cart, allowed: Sequence[CartStatus], *, action: str) -> CartStatus:
    cur = get_cart_status(cart)
    if cur not in allowed:
        raise InvalidCartTransitionError(
            f"Nie można wykonać {action}: status wózka to {cur.value}, "
            f"oczekiwano {[s.value for s in allowed]}.",
            from_status=cur.value,
        )
    return cur


def _populate_cart_baskets(db: Session, cart: Cart) -> Cart:
    """
    Dograj ``cart.baskets`` osobnym SELECT (selectinload).

    Nie łączyć z ``with_for_update()`` — PostgreSQL:
    ``FOR UPDATE cannot be applied to the nullable side of an outer join``
    (``joinedload`` / LEFT OUTER JOIN).
    """
    cid = int(cart.id)
    loaded = (
        db.query(Cart)
        .options(selectinload(Cart.baskets))
        .filter(Cart.id == cid)
        .first()
    )
    return loaded if loaded is not None else cart


def _lock_cart(db: Session, cart: Cart) -> Cart:
    """
    SELECT … FOR UPDATE wyłącznie na wierszu ``carts``.

    Relacje (baskets) ładujemy dopiero po uzyskaniu blokady — bez OUTER JOIN.
    """
    cid = int(cart.id)
    locked = (
        db.query(Cart)
        .filter(Cart.id == cid)
        .with_for_update()
        .first()
    )
    if locked is None:
        raise CartLifecycleError("Nie znaleziono wózka.", code="cart_not_found")
    return _populate_cart_baskets(db, locked)


def _lock_cart_by_keys(
    db: Session,
    *,
    cart_id: int,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
) -> Cart:
    """FOR UPDATE na ``carts`` po id (+ opcjonalny tenant/warehouse), potem baskets."""
    q = db.query(Cart).filter(Cart.id == int(cart_id))
    if tenant_id is not None:
        q = q.filter(Cart.tenant_id == int(tenant_id))
    if warehouse_id is not None:
        q = q.filter(Cart.warehouse_id == int(warehouse_id))
    locked = q.with_for_update().first()
    if locked is None:
        raise CartLifecycleError("Nie znaleziono wózka.", code="cart_not_found")
    return _populate_cart_baskets(db, locked)


def assert_cart_lifecycle_invariants(db: Session, cart: Cart, *, strict: bool = False) -> list[str]:
    """
    Niezmienniki status→powiązania. Zwraca listę naruszeń (pusta = OK).
    Po mutacjach wywoływane z strict=False (log warning); testy mogą użyć strict=True.
    """
    violations: list[str] = []
    st = get_cart_status(cart)
    cid = int(cart.id)
    sess = find_open_picking_session(db, cart=cart)
    orders_n = len(_orders_on_cart(db, cid))
    assigned = getattr(cart, "assigned_user_id", None)
    packing = getattr(cart, "packing_user_id", None)
    cur_sid = getattr(cart, "current_session_id", None)

    if st == CartStatus.AVAILABLE:
        if sess is not None:
            violations.append("AVAILABLE: aktywna sesja picking")
        if assigned is not None:
            violations.append("AVAILABLE: assigned_user ustawiony")
        if packing is not None:
            violations.append("AVAILABLE: packing_user ustawiony")
        if cur_sid is not None:
            violations.append("AVAILABLE: current_session_id ustawione")
    elif st == CartStatus.ASSIGNED:
        if sess is not None:
            violations.append("ASSIGNED: aktywna sesja picking")
        if cur_sid is not None:
            violations.append("ASSIGNED: current_session_id ustawione")
        if orders_n > 0:
            violations.append("ASSIGNED: istnieją order.cart_id")
        if assigned is None:
            violations.append("ASSIGNED: brak assigned_user")
    elif st == CartStatus.PICKING:
        if sess is None:
            violations.append("PICKING: brak aktywnej PickingSession")
        if cur_sid is None:
            violations.append("PICKING: brak current_session_id")
        elif sess is not None and int(cur_sid) != int(sess.id):
            violations.append("PICKING: current_session_id != open session")
    elif st == CartStatus.READY_FOR_PACKING:
        if sess is not None:
            violations.append("READY_FOR_PACKING: aktywna sesja picking")
        if cur_sid is not None:
            violations.append("READY_FOR_PACKING: current_session_id powinno być NULL")
        if orders_n <= 0:
            violations.append("READY_FOR_PACKING: brak order.cart_id")
    elif st == CartStatus.PACKING:
        if sess is not None:
            violations.append("PACKING: aktywna sesja picking")
        if packing is None:
            violations.append("PACKING: brak packing_user")
        # PackingSession jest per-order (WmsPackingSession), nie per-cart — nie wymagamy tu.

    if violations:
        msg = f"cart_lifecycle.invariant_breach cart_id={cid} status={st.value}: {violations}"
        if strict:
            raise InvalidCartStateError(msg, status=st.value)
        logger.warning(msg)
    return violations


def _after_mutation(db: Session, cart: Cart) -> None:
    """Flush + sprawdzenie invariantów w tej samej transakcji (bez commit)."""
    db.flush()
    assert_cart_lifecycle_invariants(db, cart, strict=False)


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
) -> tuple[list[Order], dict[int, int]]:
    """
    Capacity Engine SSOT at startPicking.
    Returns (selected_orders, basket_assignments order_id→basket_id).
    """
    from .cart_capacity import CartCapacityExceeded, select_orders_for_cart

    cand = list(candidates)
    if not cand:
        return [], {}
    try:
        result = select_orders_for_cart(db, cart, cand, on_capacity=on_capacity)
    except CartCapacityExceeded:
        raise
    return list(result.orders), dict(result.basket_assignments)


# ---------------------------------------------------------------------------
# Public API — CartLifecycleService
# ---------------------------------------------------------------------------


def _record_event(
    db: Session,
    cart: Cart,
    event_code: str,
    *,
    operator_user_id: int | None = None,
    session_id: int | None = None,
    batch_id: int | None = None,
    order_id: int | None = None,
    metadata: dict[str, Any] | None = None,
    description: str | None = None,
) -> None:
    """Jedyny zapis Event Log — wyłącznie z tego modułu. Logika = event_code, nie description."""
    from .cart_lifecycle_extensions import append_lifecycle_event

    append_lifecycle_event(
        db,
        cart=cart,
        event_code=event_code,
        operator_user_id=operator_user_id,
        session_id=session_id if session_id is not None else getattr(cart, "current_session_id", None),
        batch_id=batch_id,
        order_id=order_id,
        description=description,
        metadata=metadata,
    )


def claim_cart(
    db: Session,
    *,
    cart: Cart,
    operator_user_id: int,
) -> Cart:
    """
    AVAILABLE → ASSIGNED.

    Operator wybrał wózek. Bez zamówień, bez sesji, bez current_session_id.
    Idempotentne dla tego samego operatora (ASSIGNED → refresh, bez drugiej historii).
    """
    uid = int(operator_user_id)
    if uid <= 0:
        raise CartLifecycleError("Wymagany operator.", code="operator_required")

    cart = _lock_cart(db, cart)
    st = get_cart_status(cart)
    if st == CartStatus.ASSIGNED:
        existing = getattr(cart, "assigned_user_id", None)
        if existing is not None and int(existing) != uid:
            _record_event(
                db,
                cart,
                "double_claim_attempt",
                operator_user_id=uid,
                metadata={"claimed_by": int(existing)},
            )
            db.flush()
            raise CartAlreadyClaimedError()
        cart.assigned_user_id = uid
        if hasattr(cart, "claimed_at") and getattr(cart, "claimed_at", None) is None:
            cart.claimed_at = datetime.utcnow()
        apply_cart_transition(
            db,
            cart,
            CartStatus.ASSIGNED,
            operator_user_id=uid,
            reason="refresh_task",
            progress=0.0,
            total_orders=0,
            total_products=0,
        )
        _after_mutation(db, cart)
        return cart

    if st != CartStatus.AVAILABLE:
        existing = getattr(cart, "assigned_user_id", None) or getattr(cart, "packing_user_id", None)
        if existing is not None and int(existing) != uid:
            _record_event(
                db,
                cart,
                "double_claim_attempt",
                operator_user_id=uid,
                metadata={"status": st.value, "owner": int(existing)},
            )
            db.flush()
            raise CartAlreadyClaimedError()
        _require_status(cart, (CartStatus.AVAILABLE,), action="claimCart")

    _require_status(cart, (CartStatus.AVAILABLE,), action="claimCart")

    orphans = _orders_on_cart(db, int(cart.id))
    if orphans:
        for o in orphans:
            clear_order_picking_session_context(o)
            db.add(o)
        logger.warning(
            "cart_lifecycle.claim_cleared_orphans cart_id=%s count=%s",
            int(cart.id),
            len(orphans),
        )

    now = datetime.utcnow()
    cart.assigned_user_id = uid
    cart.current_session_id = None
    if hasattr(cart, "packing_user_id"):
        cart.packing_user_id = None
    if hasattr(cart, "started_at"):
        cart.started_at = None
    if hasattr(cart, "claimed_at"):
        cart.claimed_at = now
    apply_cart_transition(
        db,
        cart,
        CartStatus.ASSIGNED,
        operator_user_id=uid,
        reason="claim_cart",
        progress=0.0,
        total_orders=0,
        total_products=0,
    )
    _record_event(db, cart, "cart_claimed", operator_user_id=uid)
    _after_mutation(db, cart)
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

    Wejście: ASSIGNED (po claim) lub AVAILABLE (atomowo → PICKING, jedna historia).
    Capacity walidowana tutaj — nie wcześniej.
    Idempotentne: PICKING + otwarta sesja → zwraca istniejącą (bez nowej historii).
    """
    uid = int(operator_user_id)
    if uid <= 0:
        raise CartLifecycleError("Wymagany operator.", code="operator_required")

    cart = _lock_cart(db, cart)
    st = get_cart_status(cart)
    if st == CartStatus.PICKING:
        sess = find_open_picking_session(db, cart=cart)
        if sess is not None:
            return sess
        raise SessionNotFoundError("Status PICKING bez aktywnej sesji — użyj cancel lub heal.")

    if st == CartStatus.ASSIGNED:
        existing = getattr(cart, "assigned_user_id", None)
        if existing is not None and int(existing) != uid:
            try:
                _record_event(
                    db,
                    cart,
                    "double_claim_attempt",
                    operator_user_id=uid,
                    metadata={"context": "start_picking", "claimed_by": int(existing)},
                )
                db.flush()
            except Exception:
                logger.exception("START_PICKING FAIL at double_claim_attempt/_record_event+flush")
                raise
            raise CartAlreadyClaimedError(
                "Wózek jest zarezerwowany przez innego operatora — nie można rozpocząć zbierania."
            )
    elif st == CartStatus.AVAILABLE:
        # Scenariusz B: bez pośredniego ASSIGNED — assigned_user dopiero po capacity OK
        cart.current_session_id = None
        if hasattr(cart, "packing_user_id"):
            cart.packing_user_id = None
    else:
        _require_status(cart, (CartStatus.ASSIGNED, CartStatus.AVAILABLE), action="startPicking")

    if get_cart_status(cart) not in (CartStatus.ASSIGNED, CartStatus.AVAILABLE):
        _require_status(cart, (CartStatus.ASSIGNED, CartStatus.AVAILABLE), action="startPicking")

    # Nie wolno mieć premature order.cart_id przed assign
    existing_orders = _orders_on_cart(db, int(cart.id))
    if existing_orders:
        try:
            for o in existing_orders:
                clear_order_picking_session_context(o)
                db.add(o)
        except Exception:
            logger.exception("START_PICKING FAIL at clear_premature_orders")
            raise
        logger.warning(
            "cart_lifecycle.start_cleared_premature_orders cart_id=%s count=%s",
            int(cart.id),
            len(existing_orders),
        )

    free_candidates = [o for o in orders if getattr(o, "cart_id", None) is None]

    selected, basket_assignments = _apply_capacity_slice(
        db, cart, free_candidates, on_capacity=on_capacity
    )
    if not selected and free_candidates:
        from .cart_capacity import CartCapacityExceeded

        raise CartCapacityExceeded(
            current_orders=0,
            capacity_orders=int(getattr(cart, "capacity_orders", None) or 0),
            attempted=len(free_candidates),
            strategy=str(getattr(cart, "capacity_strategy", None) or ""),
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

    try:
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
    except Exception:
        logger.exception("START_PICKING FAIL at create_WmsOperationSession/flush")
        raise

    sid = int(sess.id)
    cart.current_session_id = sid
    cart.assigned_user_id = uid
    cart.started_at = now
    if hasattr(cart, "claimed_at"):
        cart.claimed_at = None
    if hasattr(cart, "packing_user_id"):
        cart.packing_user_id = None

    used_vol = 0.0
    try:
        baskets_by_id = {
            int(b.id): b for b in (getattr(cart, "baskets", None) or [])
        }
        for o in selected:
            o.cart_id = cid
            if hasattr(o, "picking_session_id"):
                o.picking_session_id = sid
            bid = basket_assignments.get(int(o.id))
            if bid is not None:
                o.basket_id = int(bid)
                basket = baskets_by_id.get(int(bid))
                if basket is not None:
                    basket.order_id = int(o.id)
                    basket.used_volume = float(getattr(o, "total_volume_dm3", None) or 0)
                    db.add(basket)
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
    except Exception:
        logger.exception("START_PICKING FAIL at assign_orders")
        raise

    try:
        # Jedna historia: AVAILABLE|ASSIGNED → PICKING (nigdy AVAILABLE→ASSIGNED→PICKING w tym wywołaniu)
        apply_cart_transition(
            db,
            cart,
            CartStatus.PICKING,
            operator_user_id=uid,
            reason="start_picking",
            task_id=sid,
            progress=0.0,
            total_orders=len(selected),
            metadata={"order_ids": [int(o.id) for o in selected]},
        )
    except Exception:
        logger.exception("START_PICKING FAIL at apply_cart_transition")
        raise

    try:
        _record_event(
            db,
            cart,
            "picking_started",
            operator_user_id=uid,
            session_id=sid,
            metadata={"order_ids": [int(o.id) for o in selected], "orders_count": len(selected)},
        )
    except Exception:
        logger.exception("START_PICKING FAIL at _record_event")
        raise

    try:
        _after_mutation(db, cart)
    except Exception:
        logger.exception("START_PICKING FAIL at _after_mutation")
        raise

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
    reason: str = "cancel_picking",
) -> dict[str, Any]:
    """Anuluj z ASSIGNED | PICKING → AVAILABLE. Idempotentne gdy już AVAILABLE."""
    cart = _lock_cart_by_keys(
        db,
        cart_id=int(cart_id),
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
    )

    st = get_cart_status(cart)
    if st == CartStatus.AVAILABLE:
        return {
            "cart_id": int(cart_id),
            "orders_restored": 0,
            "cart_status": CartStatus.AVAILABLE.value,
            "idempotent": True,
        }
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

    release_cart(db, cart=cart, reason=reason, _already_locked=True)
    if reason in ("auto_release_no_picks",):
        pass  # event emitted inside release_cart
    elif reason == "assigned_timeout":
        pass
    else:
        _record_event(
            db,
            cart,
            "picking_cancelled",
            operator_user_id=operator_user_id,
            metadata={"orders_restored": restored, "reason": reason},
        )
    _after_mutation(db, cart)
    logger.info("cart_lifecycle.cancel cart_id=%s restored=%s reason=%s", int(cart_id), restored, reason)
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
    Idempotentne gdy już READY_FOR_PACKING.
    """
    cart = _lock_cart(db, cart)
    st = get_cart_status(cart)
    if st == CartStatus.READY_FOR_PACKING:
        return
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
    sess_id = int(sess.id) if sess is not None else None
    if sess is not None and sess.completed_at is None:
        sess.completed_at = now
        sess.last_activity_at = now
        sess.completed_reason = "picking_finished"
        db.add(sess)

    cart.current_session_id = None
    apply_cart_transition(
        db,
        cart,
        CartStatus.READY_FOR_PACKING,
        operator_user_id=operator_user_id or getattr(cart, "assigned_user_id", None),
        reason="finish_picking",
        task_id=sess_id,
        progress=100.0,
        total_orders=len(order_list),
        metadata={"order_ids": [int(o.id) for o in order_list]},
    )
    _record_event(
        db,
        cart,
        "picking_finished",
        operator_user_id=operator_user_id or getattr(cart, "assigned_user_id", None),
        session_id=sess_id,
        metadata={"order_ids": [int(o.id) for o in order_list]},
    )
    _after_mutation(db, cart)
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
    Idempotentne gdy już PACKING (refresh packing_user, bez drugiej historii statusu).
    """
    uid = int(operator_user_id)
    if uid <= 0:
        raise CartLifecycleError("Wymagany operator pakujący.", code="operator_required")

    cart = _lock_cart(db, cart)
    st = get_cart_status(cart)
    if st == CartStatus.PACKING:
        if hasattr(cart, "packing_user_id"):
            cart.packing_user_id = uid
        cart.assigned_user_id = None
        apply_cart_transition(
            db,
            cart,
            CartStatus.PACKING,
            operator_user_id=uid,
            reason="refresh_task",
            progress=0.0,
        )
        _after_mutation(db, cart)
        return cart

    _require_status(cart, (CartStatus.READY_FOR_PACKING,), action="startPacking")

    cart.assigned_user_id = None
    if hasattr(cart, "packing_user_id"):
        cart.packing_user_id = uid
    apply_cart_transition(
        db,
        cart,
        CartStatus.PACKING,
        operator_user_id=uid,
        reason="start_packing",
        progress=0.0,
    )
    _record_event(db, cart, "packing_started", operator_user_id=uid)
    _after_mutation(db, cart)
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
    Idempotentne: ponowne finish tego samego order_id / AVAILABLE → True bez szkody.
    """
    del tenant_id, warehouse_id
    cart = _lock_cart(db, cart)
    st = get_cart_status(cart)
    if st == CartStatus.AVAILABLE:
        return True
    if st not in (CartStatus.PACKING, CartStatus.READY_FOR_PACKING):
        raise InvalidCartTransitionError(
            f"finishPacking wymaga PACKING (jest {st.value}). Najpierw skan wózka (startPacking).",
            from_status=st.value,
        )

    cid = int(cart.id)
    packed = db.query(Order).filter(Order.id == int(packed_order_id)).first()
    if packed is not None and getattr(packed, "cart_id", None) is not None:
        if int(packed.cart_id) == cid:
            clear_order_picking_session_context(packed)
            db.add(packed)

    remaining = (
        db.query(Order)
        .filter(Order.cart_id == cid, Order.deleted_at.is_(None))
        .count()
    )
    if remaining > 0:
        if st != CartStatus.PACKING:
            apply_cart_transition(
                db,
                cart,
                CartStatus.PACKING,
                operator_user_id=getattr(cart, "packing_user_id", None),
                reason="finish_packing_continue",
            )
        else:
            apply_cart_transition(
                db,
                cart,
                CartStatus.PACKING,
                operator_user_id=getattr(cart, "packing_user_id", None),
                reason="refresh_task",
            )
        _record_event(
            db,
            cart,
            "order_packed",
            operator_user_id=getattr(cart, "packing_user_id", None),
            order_id=int(packed_order_id),
            metadata={"remaining_orders": remaining},
        )
        _after_mutation(db, cart)
        return False

    _record_event(
        db,
        cart,
        "packing_finished",
        operator_user_id=getattr(cart, "packing_user_id", None),
        order_id=int(packed_order_id),
    )
    release_cart(db, cart=cart, reason="last_order_packed", _already_locked=True)
    _after_mutation(db, cart)
    return True


def release_cart(
    db: Session,
    *,
    cart: Cart,
    reason: str = "release",
    _already_locked: bool = False,
) -> None:
    """
    Pełny reset → AVAILABLE.
    Idempotentne gdy już AVAILABLE (bez drugiej historii).
    """
    if not _already_locked:
        cart = _lock_cart(db, cart)
    if get_cart_status(cart) == CartStatus.AVAILABLE and getattr(cart, "assigned_user_id", None) is None:
        # Już czysty AVAILABLE — no-op (bez historii)
        return

    for basket in list(cart.baskets or []):
        basket.order_id = None
        basket.used_volume = 0.0
        db.add(basket)
    cart.used_volume = 0.0
    cart.assigned_user_id = None
    cart.current_session_id = None
    if hasattr(cart, "packing_user_id"):
        cart.packing_user_id = None
    if hasattr(cart, "started_at"):
        cart.started_at = None
    if hasattr(cart, "claimed_at"):
        cart.claimed_at = None
    apply_cart_transition(
        db,
        cart,
        CartStatus.AVAILABLE,
        operator_user_id=None,
        reason=reason,
        progress=0.0,
        total_orders=0,
        total_products=0,
    )
    # Jeden event biznesowy zależnie od powodu zwolnienia
    if reason == "assigned_timeout":
        _record_event(db, cart, "reservation_timed_out")
    elif reason == "auto_release_no_picks":
        _record_event(db, cart, "cart_auto_released_idle")
    elif reason in ("cancel_picking",) or str(reason).startswith("cancel"):
        pass  # event „Anulowano kompletację” w cancel_picking
    elif reason == "last_order_packed":
        _record_event(db, cart, "cart_released", metadata={"reason": reason})
    else:
        _record_event(db, cart, "cart_released", metadata={"reason": reason})
    if not _already_locked:
        _after_mutation(db, cart)
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
        ):
            continue
        cur_sid = getattr(cart, "current_session_id", None)
        if st != CartStatus.PICKING or cur_sid is None or int(cur_sid or 0) != int(sess.id):
            cart.current_session_id = int(sess.id)
            if getattr(cart, "assigned_user_id", None) is None and getattr(sess, "operator_user_id", None):
                cart.assigned_user_id = int(sess.operator_user_id)
            if getattr(cart, "started_at", None) is None:
                cart.started_at = getattr(sess, "started_at", None) or datetime.utcnow()
            apply_cart_transition(
                db,
                cart,
                CartStatus.PICKING,
                operator_user_id=getattr(sess, "operator_user_id", None),
                reason="self_heal",
                task_id=int(sess.id),
            )
            healed += 1
            logger.warning(
                "cart_lifecycle.self_heal cart_id=%s → PICKING session_id=%s",
                cid,
                int(sess.id),
            )
    # Bez wewnętrznego commit — wywołujący (startup/worker) robi commit transakcji.
    if healed:
        db.flush()
    return healed


def refresh_current_task_progress(db: Session, cart: Cart) -> dict[str, Any] | None:
    """
    Odśwież snapshot Current Task (picked/remaining/progress) bez zapisu historii.
    Nie zmienia statusu ani powiązań.
    """
    from .cart_lifecycle_extensions import (
        build_task_for_status,
        compute_pick_progress,
        get_current_task,
        write_current_task,
    )

    st = get_cart_status(cart)
    if st == CartStatus.AVAILABLE:
        write_current_task(cart, None)
        db.add(cart)
        db.flush()
        return None

    orders_n, products_n = _counts_for_cart(db, cart)
    picked_n, remaining_n, prog = 0, int(products_n or 0), 0.0
    if st in (CartStatus.PICKING, CartStatus.READY_FOR_PACKING, CartStatus.PACKING):
        picked_n, remaining_n, prog = compute_pick_progress(db, cart)
        if st == CartStatus.READY_FOR_PACKING:
            prog = 100.0
            remaining_n = 0
    op = getattr(cart, "assigned_user_id", None) or getattr(cart, "packing_user_id", None)
    if st == CartStatus.PACKING:
        op = getattr(cart, "packing_user_id", None) or op
    started = getattr(cart, "started_at", None)
    if st == CartStatus.ASSIGNED:
        started = getattr(cart, "claimed_at", None) or started
    task = build_task_for_status(
        status=st,
        operator_id=int(op) if op is not None else None,
        task_id=getattr(cart, "current_session_id", None),
        started_at=started if isinstance(started, datetime) else datetime.utcnow(),
        progress=prog,
        total_orders=orders_n,
        total_products=products_n,
        picked_count=picked_n,
        remaining_count=remaining_n,
    )
    write_current_task(cart, task)
    db.add(cart)
    db.flush()
    return get_current_task(db, cart, enrich=True)


def release_stale_assigned_carts(db: Session, *, timeout_minutes: int | None = None) -> int:
    """
    ASSIGNED dłużej niż timeout bez startPicking → AVAILABLE.
    Każdy wózek: FOR UPDATE przed release (race z startPicking/claim).
    """
    from datetime import timedelta

    from .cart_lifecycle_extensions import assigned_timeout_minutes, parse_current_task

    minutes = int(timeout_minutes) if timeout_minutes is not None else assigned_timeout_minutes()
    cutoff = datetime.utcnow() - timedelta(minutes=minutes)
    cart_ids = [
        int(r[0])
        for r in db.query(Cart.id).filter(Cart.status == CartStatus.ASSIGNED.value).all()
    ]
    released = 0
    for cid in cart_ids:
        try:
            cart = _lock_cart_by_keys(db, cart_id=cid)
        except CartLifecycleError:
            continue
        if get_cart_status(cart) != CartStatus.ASSIGNED:
            continue
        claimed = getattr(cart, "claimed_at", None)
        if claimed is None:
            task = parse_current_task(cart)
            if task and task.started_at:
                try:
                    claimed = datetime.fromisoformat(task.started_at.replace("Z", ""))
                except ValueError:
                    claimed = None
        if claimed is None:
            claimed = datetime.min
        if claimed > cutoff:
            continue
        release_cart(db, cart=cart, reason="assigned_timeout", _already_locked=True)
        released += 1
        logger.info(
            "cart_lifecycle.assigned_timeout cart_id=%s claimed_at=%s",
            int(cart.id),
            claimed,
        )
    return released


def auto_release_picking_without_confirmed_picks(
    db: Session,
    *,
    idle_minutes: int | None = None,
) -> int:
    """
    PICKING + 0 potwierdzonych picków + idle session → AVAILABLE.

    Jeżeli jest ≥1 Pick na wózku — auto-release zabronione.
    FOR UPDATE przed cancel (race z finishPicking / heartbeat / pick).
    """
    from datetime import timedelta

    from .cart_lifecycle_extensions import (
        count_confirmed_picks_on_cart,
        picking_idle_no_picks_minutes,
    )

    minutes = int(idle_minutes) if idle_minutes is not None else picking_idle_no_picks_minutes()
    cutoff = datetime.utcnow() - timedelta(minutes=minutes)
    cart_ids = [
        int(r[0])
        for r in db.query(Cart.id).filter(Cart.status == CartStatus.PICKING.value).all()
    ]
    released = 0
    for cid in cart_ids:
        try:
            cart = _lock_cart_by_keys(db, cart_id=cid)
        except CartLifecycleError:
            continue
        if get_cart_status(cart) != CartStatus.PICKING:
            continue
        picks_n = count_confirmed_picks_on_cart(db, int(cart.id))
        if picks_n > 0:
            continue
        sess = find_open_picking_session(db, cart=cart)
        last_act = None
        if sess is not None:
            last_act = getattr(sess, "last_activity_at", None) or getattr(sess, "started_at", None)
        if last_act is None:
            last_act = getattr(cart, "started_at", None)
        if last_act is None or last_act > cutoff:
            continue
        try:
            cancel_picking(
                db,
                cart_id=int(cart.id),
                tenant_id=int(cart.tenant_id),
                warehouse_id=int(cart.warehouse_id),
                operator_user_id=getattr(cart, "assigned_user_id", None),
                reason="auto_release_no_picks",
            )
            released += 1
            logger.info(
                "cart_lifecycle.auto_release_no_picks cart_id=%s last_activity=%s",
                int(cart.id),
                last_act,
            )
        except CartLifecycleError:
            logger.exception(
                "cart_lifecycle.auto_release_no_picks_failed cart_id=%s",
                int(cart.id),
            )
    return released


def run_cart_lifecycle_maintenance(db: Session) -> dict[str, int]:
    """Timeout ASSIGNED + auto-release PICKING bez picków."""
    a = release_stale_assigned_carts(db)
    b = auto_release_picking_without_confirmed_picks(db)
    return {"assigned_timeout_released": a, "picking_no_picks_released": b}


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


# Public re-exports for screens (read-only)
def get_cart_current_task(db: Session, cart: Cart, *, enrich: bool = True) -> dict[str, Any] | None:
    from .cart_lifecycle_extensions import get_active_picking

    return get_active_picking(db, cart, enrich=enrich)


get_active_picking = get_cart_current_task


def notify_first_product_confirmed(
    db: Session,
    *,
    cart: Cart,
    operator_user_id: int | None = None,
    order_id: int | None = None,
    product_id: int | None = None,
) -> bool:
    """
    Wywoływane po udanym potwierdzeniu picka.
    Zapisuje dokładnie jeden event „Potwierdzono pierwszy produkt” na sesję/wózek.
    """
    from .cart_lifecycle_event_catalog import EVENT_FIRST_PRODUCT_CONFIRMED
    from .cart_lifecycle_extensions import count_confirmed_picks_on_cart, list_lifecycle_events

    if get_cart_status(cart) != CartStatus.PICKING:
        return False
    if count_confirmed_picks_on_cart(db, int(cart.id)) != 1:
        return False
    sid = getattr(cart, "current_session_id", None)
    existing = list_lifecycle_events(db, cart_id=int(cart.id), limit=50)
    for ev in existing:
        if ev.event_code == EVENT_FIRST_PRODUCT_CONFIRMED:
            if sid is None or ev.session_id is None or int(ev.session_id) == int(sid):
                return False
    _record_event(
        db,
        cart,
        EVENT_FIRST_PRODUCT_CONFIRMED,
        operator_user_id=operator_user_id or getattr(cart, "assigned_user_id", None),
        session_id=int(sid) if sid is not None else None,
        order_id=order_id,
        metadata={"product_id": product_id} if product_id is not None else None,
    )
    refresh_current_task_progress(db, cart)
    return True


def list_cart_lifecycle_events(
    db: Session,
    *,
    cart_id: int,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Historia Event Log gotowa do UI (opisy PL)."""
    from .cart_lifecycle_extensions import list_lifecycle_events

    rows = list_lifecycle_events(
        db,
        cart_id=cart_id,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        limit=limit,
    )
    # Chronologicznie rosnąco dla widoku historii
    rows_asc = list(reversed(rows))
    out: list[dict[str, Any]] = []
    for r in rows_asc:
        out.append(
            {
                "id": int(r.id),
                "cart_id": int(r.cart_id),
                "event_code": r.event_code,
                "description": r.description,
                "severity": r.severity,
                "operator_user_id": r.operator_user_id,
                "occurred_at": r.occurred_at.isoformat(sep=" ", timespec="seconds")
                if getattr(r, "occurred_at", None)
                else None,
                "session_id": r.session_id,
                "batch_id": r.batch_id,
                "order_id": r.order_id,
                "metadata": None,
            }
        )
        raw = getattr(r, "metadata_json", None)
        if raw:
            try:
                import json as _json

                parsed = _json.loads(raw)
                out[-1]["metadata"] = parsed if isinstance(parsed, dict) else {"raw": raw}
            except Exception:
                out[-1]["metadata"] = {"raw": raw}
    return out


def list_cart_lifecycle_history(
    db: Session,
    *,
    cart_id: int,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    from .cart_lifecycle_extensions import list_lifecycle_history

    rows = list_lifecycle_history(
        db,
        cart_id=cart_id,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        limit=limit,
    )
    out: list[dict[str, Any]] = []
    for r in rows:
        out.append(
            {
                "id": int(r.id),
                "cart_id": int(r.cart_id),
                "from_status": r.from_status,
                "to_status": r.to_status,
                "operator_user_id": r.operator_user_id,
                "changed_at": r.changed_at.isoformat(sep=" ", timespec="seconds")
                if getattr(r, "changed_at", None)
                else None,
                "reason": r.reason,
                "task_type": r.task_type,
                "task_id": r.task_id,
                "batch_id": r.batch_id,
            }
        )
    return out


# Backward-compatible aliases (deprecated names → new API)

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
        apply_cart_transition(
            db,
            cart,
            CartStatus.PACKING,
            operator_user_id=getattr(cart, "packing_user_id", None),
            reason="legacy_finish_pack_promoted",
        )
        db.flush()
    return finish_packing(
        db,
        cart=cart,
        packed_order_id=int(packed_order_id),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
    )


def mark_cart_packing(cart: Cart) -> None:
    """Deprecated — użyj start_packing. Nie mutuje statusu poza SSOT transition."""
    raise CartLifecycleError(
        "mark_cart_packing zabronione. Użyj CartLifecycleService.start_packing.",
        code="legacy_mark_packing_forbidden",
    )


def mark_cart_picking(cart: Cart) -> None:
    """Deprecated — użyj start_picking."""
    raise CartLifecycleError(
        "mark_cart_picking zabronione. Użyj CartLifecycleService.start_picking.",
        code="legacy_mark_picking_forbidden",
    )


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
    if getattr(cart, "started_at", None) is None:
        cart.started_at = getattr(sess, "started_at", None) or now
    if force_picking:
        apply_cart_transition(
            db,
            cart,
            CartStatus.PICKING,
            operator_user_id=getattr(cart, "assigned_user_id", None),
            reason="self_heal_bind",
            task_id=sid,
        )
    else:
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
