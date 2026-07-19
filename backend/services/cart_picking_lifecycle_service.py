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
    """SSOT: same set as cart_stats_service.list_orders_on_cart (cart_id + session heal)."""
    from .cart_stats_service import list_orders_on_cart

    cart = db.query(Cart).filter(Cart.id == int(cart_id)).first()
    if cart is None:
        return []
    return list_orders_on_cart(db, cart)


def _apply_capacity_slice(
    db: Session,
    cart: Cart,
    candidates: Sequence[Order],
    *,
    on_capacity: CapacityPolicy,
) -> tuple[list[Order], dict[int, int], list[tuple[Order, str]]]:
    """
    Capacity Engine SSOT at startPicking.
    Returns (selected_orders, basket_assignments, rejected[(order, reason_code)]).
    """
    from .cart_capacity import CartCapacityExceeded, select_orders_for_cart

    cand = list(candidates)
    if not cand:
        return [], {}, []
    try:
        result = select_orders_for_cart(db, cart, cand, on_capacity=on_capacity)
    except CartCapacityExceeded:
        raise
    rejected = [
        (r.order, str(r.reason or "capacity_reached"))
        for r in (getattr(result, "rejected", None) or [])
        if r.order is not None
    ]
    return list(result.orders), dict(result.basket_assignments), rejected


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

    already_assigned = [o for o in orders if getattr(o, "cart_id", None) is not None]
    free_candidates = [o for o in orders if getattr(o, "cart_id", None) is None]

    # Defensywna Walidacja WMS — przed Capacity (ten sam SSOT co bootstrap).
    try:
        from .wms_order_validation.gate import gate_orders_before_capacity

        free_candidates = gate_orders_before_capacity(
            db,
            orders=free_candidates,
            tenant_id=int(cart.tenant_id),
            warehouse_id=int(cart.warehouse_id),
            operator_user_id=None,
        )
    except Exception:
        logger.exception("START_PICKING validation gate failed cart_id=%s", int(cart.id))
        raise

    selected, basket_assignments, engine_rejected = _apply_capacity_slice(
        db, cart, free_candidates, on_capacity=on_capacity
    )
    # Capacity Analytics (not Activity Log): already-assigned + engine rejects
    analytics_rejected: list[tuple[Order, str]] = [
        (o, "already_assigned") for o in already_assigned
    ] + list(engine_rejected)
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
    baskets_by_id = {int(b.id): b for b in (getattr(cart, "baskets", None) or [])}
    try:
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
        from .cart_stats_service import format_orders_operation_description, activity_orders_meta
        from .cart_display import cart_display_name_for_wms

        # Activity Log: assign shows # list; picking_started does not.
        cart_label = cart_display_name_for_wms(cart)
        assign_meta = {
            **activity_orders_meta(selected, show_order_numbers=True),
            "assigned_volume": round(used_vol, 2),
            "cart_label": cart_label,
        }
        _record_event(
            db,
            cart,
            "picking_started",
            operator_user_id=uid,
            session_id=sid,
            description="Rozpoczęto kompletację.",
            metadata={"cart_label": cart_label, "show_order_numbers": False},
        )
        _record_event(
            db,
            cart,
            "orders_assigned",
            operator_user_id=uid,
            session_id=sid,
            description=format_orders_operation_description(
                "Przypisano",
                selected,
                for_activity_log=True,
                cart_label=cart_label,
            ),
            metadata=dict(assign_meta),
        )
        # Capacity Analytics — aggregates + lazy details (never Activity Log skips).
        try:
            from .cart_capacity.analytics_service import persist_capacity_run
            from .cart_capacity.profile import resolve_capacity_strategy

            persist_capacity_run(
                db,
                cart=cart,
                source="start_picking",
                strategy=resolve_capacity_strategy(cart).value,
                operator_user_id=uid,
                assigned=selected,
                rejected=analytics_rejected,
                occurred_at=now,
            )
        except Exception:
            logger.exception("capacity_analytics persist failed at start_picking")
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
    # Explicit detach history before context clear (release_cart may see empty SSOT).
    if orders and not str(reason).startswith("admin_"):
        from .cart_stats_service import activity_orders_meta

        _record_event(
            db,
            cart,
            "admin_orders_detached",
            operator_user_id=operator_user_id,
            description="Odłączono wszystkie zamówienia.",
            metadata=activity_orders_meta(orders, show_order_numbers=True),
        )
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
    elif str(reason).startswith("admin_"):
        pass  # eventy emituje admin_release_cart
    else:
        _record_event(
            db,
            cart,
            "picking_cancelled",
            operator_user_id=operator_user_id,
            description="Anulowano kompletację.",
            metadata={"orders_restored": restored, "reason": reason, "show_order_numbers": False},
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

    Tylko zamówienia przekazane w ``orders`` (lub wszystkie na wózku) są traktowane
    jako bound do pakowania — nie nadpisuj statusów zamówień już odłączonych.
    """
    cart = _lock_cart(db, cart)
    st = get_cart_status(cart)
    if st == CartStatus.READY_FOR_PACKING:
        return
    _require_status(cart, (CartStatus.PICKING,), action="finishPicking")
    cid = int(cart.id)
    order_list = list(orders) if orders is not None else _orders_on_cart(db, cid)
    # Tylko zamówienia nadal przypięte do tego wózka (po detach shortage).
    order_list = [
        o
        for o in order_list
        if getattr(o, "cart_id", None) is not None and int(o.cart_id) == cid
    ]
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

    from .cart_stats_service import orders_event_meta

    finish_meta = orders_event_meta(order_list)
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
        metadata=dict(finish_meta),
    )
    _record_event(
        db,
        cart,
        "picking_finished",
        operator_user_id=operator_user_id or getattr(cart, "assigned_user_id", None),
        session_id=sess_id,
        metadata=dict(finish_meta),
    )
    _after_mutation(db, cart)
    logger.info(
        "cart_lifecycle.finish_picking cart_id=%s orders=%s assigned_user=%s",
        cid,
        [int(o.id) for o in order_list],
        getattr(cart, "assigned_user_id", None),
    )


def finish_picking_after_wms_finalize(
    db: Session,
    *,
    cart: Cart,
    orders: Sequence[Order],
    packing_bound_order_ids: Sequence[int],
    shortage_detach_order_ids: Sequence[int],
    operator_user_id: int | None = None,
) -> dict[str, Any]:
    """
    Domknięcie sesji zbierania po klasyfikacji finalize:

    - zamówienia shortage/BRAKI → detach (CartLifecycle), nie zostają na wózku packingowym
    - fully picked → pozostają; cart → READY_FOR_PACKING
    - gdy brak packing-bound → release cart (AVAILABLE), nie READY_FOR_PACKING

    Wywoływać wyłącznie gdy cart jest jeszcze w PICKING (przed finish_picking).
    Idempotentne: brakujące / już odłączone ordery są pomijane.
    """
    from .cart_capacity.engine import order_volume_dm3
    from .cart_display import cart_display_name_for_wms
    from .cart_stats_service import activity_orders_meta, format_orders_operation_description

    cart = _lock_cart(db, cart)
    st = get_cart_status(cart)
    cid = int(cart.id)
    packing_ids = {int(x) for x in packing_bound_order_ids if int(x) > 0}
    detach_ids = {int(x) for x in shortage_detach_order_ids if int(x) > 0}

    if st == CartStatus.READY_FOR_PACKING:
        # Idempotent retry: packing path already done; ensure shortage orders are off cart.
        remaining = _orders_on_cart(db, cid)
        still_shortage = [o for o in remaining if int(o.id) in detach_ids]
        if still_shortage:
            logger.warning(
                "cart_lifecycle.finish_after_finalize idempotent_heal "
                "READY_FOR_PACKING still has shortage orders cart_id=%s ids=%s",
                cid,
                [int(o.id) for o in still_shortage],
            )
        return {
            "cart_id": cid,
            "cart_status": st.value,
            "detached_order_ids": [],
            "packing_order_ids": [int(o.id) for o in remaining],
            "cart_released": False,
            "idempotent": True,
        }
    if st == CartStatus.AVAILABLE and not _orders_on_cart(db, cid):
        return {
            "cart_id": cid,
            "cart_status": st.value,
            "detached_order_ids": [],
            "packing_order_ids": [],
            "cart_released": True,
            "idempotent": True,
        }

    _require_status(cart, (CartStatus.PICKING,), action="finishPickingAfterFinalize")

    on_cart = _orders_on_cart(db, cid)
    by_id = {int(o.id): o for o in on_cart}
    detached: list[Order] = []
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None

    for oid in sorted(detach_ids):
        target = by_id.get(oid)
        if target is None:
            continue
        clear_order_picking_session_context(target)
        # Nie resetuj BRAKI / MISSING / NEEDS_DECISION — tylko kontekst pickingowy.
        target.picking_started_at = None
        target.total_volume_dm3 = None
        db.add(target)
        for basket in list(getattr(cart, "baskets", None) or []):
            if getattr(basket, "order_id", None) is not None and int(basket.order_id) == oid:
                basket.order_id = None
                basket.used_volume = 0.0
                db.add(basket)
        detached.append(target)

    remaining = [o for o in _orders_on_cart(db, cid) if int(o.id) not in {int(x.id) for x in detached}]
    # packing_bound may still list orders that failed detach; keep intersection with remaining
    packing_orders = [o for o in remaining if int(o.id) in packing_ids or int(o.id) not in detach_ids]
    # If caller listed packing ids, prefer that set
    if packing_ids:
        packing_orders = [o for o in remaining if int(o.id) in packing_ids]

    cart.used_volume = round(sum(order_volume_dm3(o) for o in remaining), 2)
    db.add(cart)

    if detached:
        cart_label = cart_display_name_for_wms(cart)
        meta = {
            **activity_orders_meta(detached, show_order_numbers=True),
            "reason": "picking_finalize_shortage",
            "remaining_orders": len(remaining),
            "cart_label": cart_label,
            "actor": "system" if uid is None else "operator",
        }
        for o in detached:
            _record_event(
                db,
                cart,
                "order_detached",
                operator_user_id=uid,
                order_id=int(o.id),
                description=format_orders_operation_description(
                    "Odłączono po zakończeniu zbierania z brakami",
                    [o],
                    for_activity_log=True,
                    cart_relation="od",
                ),
                metadata={**meta, "order_id": int(o.id)},
            )
            try:
                from .wms_audit_service import append_order_activity_for_wms

                append_order_activity_for_wms(
                    db,
                    order_id=int(o.id),
                    tenant_id=int(cart.tenant_id),
                    warehouse_id=int(cart.warehouse_id),
                    event_type="ORDER_DETACHED_AFTER_SHORTAGE_FINALIZE",
                    message=(
                        f"Odłączono od wózka po zakończeniu zbierania z brakami — {cart_label}"
                    ),
                    operator_user_id=uid,
                    metadata={"cart_id": cid, "reason": "picking_finalize_shortage"},
                )
            except Exception:
                logger.exception(
                    "detach_after_finalize order activity failed order_id=%s",
                    int(o.id),
                )

    released = False
    if not remaining:
        # Close open picking session before release
        sess = find_open_picking_session(db, cart=cart)
        now = datetime.utcnow()
        if sess is not None and sess.completed_at is None:
            sess.completed_at = now
            sess.last_activity_at = now
            sess.completed_reason = "picking_finished_all_shortage"
            db.add(sess)
        cart.current_session_id = None
        complete_n = len(packing_ids)
        shortage_n = len(detached)
        _record_event(
            db,
            cart,
            "picking_finished",
            operator_user_id=uid or getattr(cart, "assigned_user_id", None),
            session_id=int(sess.id) if sess is not None else None,
            description=(
                f"Zakończono kompletację — wynik: {complete_n} kompletne / {shortage_n} z brakami"
            ),
            metadata={
                "complete_orders": complete_n,
                "shortage_orders": shortage_n,
                "all_shortage": True,
            },
        )
        release_cart(db, cart=cart, reason="picking_finalize_all_shortage", _already_locked=True)
        released = True
    else:
        finish_picking(
            db,
            cart=cart,
            orders=packing_orders,
            operator_user_id=operator_user_id,
        )
        # Enrich cart finish event metadata already recorded by finish_picking —
        # add shortage summary via extra event only when detach happened.
        if detached:
            _record_event(
                db,
                cart,
                "picking_finished_summary",
                operator_user_id=uid or getattr(cart, "assigned_user_id", None),
                description=(
                    f"Zakończono kompletację — wynik: {len(packing_orders)} kompletne / "
                    f"{len(detached)} z brakami"
                ),
                metadata={
                    "complete_orders": len(packing_orders),
                    "shortage_orders": len(detached),
                    "all_shortage": False,
                },
            )
        _after_mutation(db, cart)

    logger.info(
        "cart_lifecycle.finish_after_finalize cart_id=%s detached=%s packing=%s released=%s status=%s",
        cid,
        [int(o.id) for o in detached],
        [int(o.id) for o in packing_orders],
        released,
        get_cart_status(cart).value,
    )
    return {
        "cart_id": cid,
        "cart_status": get_cart_status(cart).value,
        "detached_order_ids": [int(o.id) for o in detached],
        "packing_order_ids": [int(o.id) for o in packing_orders],
        "cart_released": released,
        "idempotent": False,
    }


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

    remaining = len(_orders_on_cart(db, cid))
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

    from .cart_stats_service import activity_orders_meta, list_orders_on_cart

    orders_snapshot = list_orders_on_cart(db, cart)
    detach_meta = activity_orders_meta(orders_snapshot, show_order_numbers=True)

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
    # Complete history: when orders leave the cart, always leave an explicit detach entry.
    if orders_snapshot and not str(reason).startswith("admin_"):
        # admin_release_cart emits its own detach event
        _record_event(
            db,
            cart,
            "admin_orders_detached",
            description="Odłączono wszystkie zamówienia.",
            metadata=dict(detach_meta),
        )
    # Business release / timeout — no order list (detach entry above covers that).
    release_meta = {"show_order_numbers": False, "reason": reason}
    if reason == "assigned_timeout":
        _record_event(
            db,
            cart,
            "reservation_timed_out",
            description="Sesja została zakończona z powodu braku aktywności.",
            metadata=dict(release_meta),
        )
    elif reason == "auto_release_no_picks":
        _record_event(
            db,
            cart,
            "cart_auto_released_idle",
            description="Sesja została zakończona z powodu braku aktywności.",
            metadata=dict(release_meta),
        )
    elif reason in ("cancel_picking",) or str(reason).startswith("cancel"):
        pass  # event „Anulowano kompletację” w cancel_picking
    elif str(reason).startswith("admin_"):
        pass  # eventy emituje admin_release_cart
    elif reason == "last_order_packed":
        _record_event(
            db,
            cart,
            "cart_released",
            description="Zwolniono wózek.",
            metadata=dict(release_meta),
        )
    else:
        _record_event(
            db,
            cart,
            "cart_released",
            description="Zwolniono wózek.",
            metadata=dict(release_meta),
        )
    if not _already_locked:
        _after_mutation(db, cart)
    logger.info("cart_lifecycle.release cart_id=%s reason=%s", int(cart.id), reason)


ADMIN_RELEASE_REASON = "admin_force_release"
ADMIN_RELEASE_READY_MSG = (
    "Wózek oczekuje na pakowanie. Aby go zwolnić należy anulować proces pakowania lub zakończyć pakowanie."
)
ADMIN_RELEASE_PACKING_MSG = (
    "Wózek jest w trakcie pakowania. Zwolnienie awaryjne jest zablokowane."
)


def _detach_cart_pick_artifacts(db: Session, cart_id: int) -> dict[str, int]:
    """Detach pick work from cart (inside lifecycle only — no external callers)."""
    from ..models.pick import Pick
    from ..models.pick_task import PickTask

    cid = int(cart_id)
    empty = {"pick_tasks_detached": 0, "draft_picks_removed": 0, "picks_detached": 0}
    try:
        tasks_n = (
            db.query(PickTask)
            .filter(PickTask.cart_id == cid)
            .update({PickTask.cart_id: None}, synchronize_session="fetch")
        )
        drafts_n = (
            db.query(Pick)
            .filter(Pick.cart_id == cid, Pick.picked_at.is_(None))
            .delete(synchronize_session=False)
        )
        picks_n = (
            db.query(Pick)
            .filter(Pick.cart_id == cid)
            .update({Pick.cart_id: None}, synchronize_session="fetch")
        )
        return {
            "pick_tasks_detached": int(tasks_n or 0),
            "draft_picks_removed": int(drafts_n or 0),
            "picks_detached": int(picks_n or 0),
        }
    except Exception:
        logger.exception("cart_lifecycle.detach_pick_artifacts failed cart_id=%s", cid)
        return empty


def _close_open_picking_session(db: Session, cart: Cart) -> bool:
    sess = find_open_picking_session(db, cart=cart)
    if sess is None or sess.completed_at is not None:
        return False
    now = datetime.utcnow()
    sess.completed_at = now
    sess.last_activity_at = now
    sess.completed_reason = "admin_force_release"
    db.add(sess)
    return True


def admin_release_cart(
    db: Session,
    *,
    cart_id: int,
    tenant_id: int,
    warehouse_id: int,
    admin_user_id: int,
    acknowledge: bool = False,
) -> dict[str, Any]:
    """
    Awaryjne zwolnienie wózka z panelu administracyjnego.

    Reguły:
      AVAILABLE (czysty) → no-op
      ASSIGNED → zwolnij
      PICKING bez potwierdzonych produktów → zwolnij
      PICKING z potwierdzonymi → anuluj kompletację, potem zwolnij
      READY_FOR_PACKING / PACKING → blokada (osobny komunikat)
    """
    import traceback as _tb

    step = 10

    def _step(n: int, msg: str) -> None:
        nonlocal step
        step = n
        logger.error("ADMIN_RELEASE STEP %s cart_id=%s %s", n, cart_id, msg)

    try:
        _step(10, f"service enter ack={acknowledge} admin={admin_user_id}")
        if not acknowledge:
            raise CartLifecycleError(
                "Potwierdź, że rozumiesz konsekwencje tej operacji.",
                code="AcknowledgeRequired",
            )

        _step(11, "lock cart FOR UPDATE")
        cart = _lock_cart_by_keys(
            db,
            cart_id=int(cart_id),
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
        )
        st = get_cart_status(cart)
        _step(
            12,
            f"locked status={st.value} assigned={getattr(cart, 'assigned_user_id', None)} "
            f"session={getattr(cart, 'current_session_id', None)}",
        )

        if st == CartStatus.READY_FOR_PACKING:
            raise InvalidCartTransitionError(
                ADMIN_RELEASE_READY_MSG,
                from_status=st.value,
            )
        if st == CartStatus.PACKING:
            raise InvalidCartTransitionError(
                ADMIN_RELEASE_PACKING_MSG,
                from_status=st.value,
            )

        from .cart_lifecycle_extensions import count_confirmed_picks_on_cart

        _step(13, "query orders_on_cart")
        orders_before = _orders_on_cart(db, int(cart_id))
        orders_n = len(orders_before)
        _step(14, f"orders_n={orders_n}")
        try:
            _step(15, "count_confirmed_picks_on_cart")
            picks_n = count_confirmed_picks_on_cart(db, int(cart_id))
            _step(16, f"picks_n={picks_n}")
        except Exception:
            logger.exception("admin_release pick count failed cart_id=%s", int(cart_id))
            picks_n = 0
            _step(16, "picks_n=0 (count failed, recovered)")
        has_operator = bool(
            getattr(cart, "assigned_user_id", None) or getattr(cart, "packing_user_id", None)
        )
        has_session = bool(getattr(cart, "current_session_id", None)) or (
            find_open_picking_session(db, cart=cart) is not None
        )
        _step(17, f"has_operator={has_operator} has_session={has_session}")

        if (
            st == CartStatus.AVAILABLE
            and not has_operator
            and orders_n == 0
            and not has_session
        ):
            _step(18, "idempotent no-op AVAILABLE")
            return {
                "cart_id": int(cart_id),
                "cart_status": CartStatus.AVAILABLE.value,
                "idempotent": True,
                "orders_detached": 0,
                "picking_cancelled": False,
            }

        picking_cancelled = False
        orders_detached = 0

        if st in (CartStatus.ASSIGNED, CartStatus.PICKING):
            if st == CartStatus.PICKING and picks_n > 0:
                picking_cancelled = True
            _step(20, f"cancel_picking reason={ADMIN_RELEASE_REASON} picking_cancelled={picking_cancelled}")
            out = cancel_picking(
                db,
                cart_id=int(cart_id),
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                operator_user_id=int(admin_user_id),
                reason=ADMIN_RELEASE_REASON,
            )
            orders_detached = int(out.get("orders_restored") or 0)
            _step(21, f"cancel_picking done orders_detached={orders_detached} out={out}")
            _step(22, "re-lock cart after cancel")
            cart = _lock_cart_by_keys(
                db,
                cart_id=int(cart_id),
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
            )
            _step(23, f"re-locked status={get_cart_status(cart).value}")
        else:
            _step(30, f"orphan/AVAILABLE path status={st.value}")
            for o in orders_before:
                clear_order_picking_session_context(o)
                db.add(o)
                orders_detached += 1
            _step(31, f"orders cleared n={orders_detached}")
            closed = _close_open_picking_session(db, cart)
            _step(32, f"session closed={closed}")
            _step(33, "release_cart")
            release_cart(db, cart=cart, reason=ADMIN_RELEASE_REASON, _already_locked=True)
            _step(34, "release_cart done")

        _step(40, "detach pick artifacts")
        artifacts = _detach_cart_pick_artifacts(db, int(cart_id))
        _step(41, f"artifacts={artifacts}")
        _step(42, "db.refresh(cart)")
        db.refresh(cart)
        _step(43, f"refreshed status={getattr(cart, 'status', None)}")

        from .cart_stats_service import activity_orders_meta, format_orders_operation_description
        from .cart_display import cart_display_name_for_wms

        orders_meta = activity_orders_meta(orders_before, show_order_numbers=True)
        cart_label = cart_display_name_for_wms(cart)
        meta_base = {
            "reason": "Ręczne zwolnienie z panelu administracyjnego.",
            "orders_detached": orders_detached,
            "picking_cancelled": picking_cancelled,
            "confirmed_picks_before": picks_n,
            "cart_label": cart_label,
            "show_order_numbers": False,
            **artifacts,
        }
        _step(50, "record admin_cart_released")
        _record_event(
            db,
            cart,
            "admin_cart_released",
            operator_user_id=int(admin_user_id),
            description="Zwolniono wózek.",
            metadata=meta_base,
        )
        _step(51, "admin_cart_released flushed")
        if orders_detached > 0:
            _step(52, "record admin_orders_detached")
            _record_event(
                db,
                cart,
                "admin_orders_detached",
                operator_user_id=int(admin_user_id),
                description="Odłączono wszystkie zamówienia.",
                metadata=dict(orders_meta),
            )
            _step(53, "admin_orders_detached flushed")
        if picking_cancelled:
            _step(54, "record admin_picking_cancelled")
            _record_event(
                db,
                cart,
                "admin_picking_cancelled",
                operator_user_id=int(admin_user_id),
                metadata={"confirmed_picks_before": picks_n},
            )
            _step(55, "admin_picking_cancelled flushed")

        _step(60, "_after_mutation")
        _after_mutation(db, cart)
        _step(61, "done")
        logger.info(
            "cart_lifecycle.admin_release cart_id=%s admin=%s orders=%s cancelled=%s",
            int(cart_id),
            int(admin_user_id),
            orders_detached,
            picking_cancelled,
        )
        return {
            "cart_id": int(cart_id),
            "cart_status": CartStatus.AVAILABLE.value,
            "idempotent": False,
            "orders_detached": orders_detached,
            "picking_cancelled": picking_cancelled,
            **artifacts,
        }
    except Exception:
        logger.error(
            "ADMIN_RELEASE FAIL AT STEP %s cart_id=%s\n%s",
            step,
            cart_id,
            _tb.format_exc(),
        )
        raise


ORDER_DETACH_BLOCKED_MSG = (
    "Nie można odłączyć zamówienia, ponieważ rozpoczęto już jego kompletację."
)


def order_has_picking_progress(db: Session, *, order_id: int, cart_id: int | None = None) -> bool:
    """True gdy z zamówienia pobrano już co najmniej jeden produkt (Pick)."""
    from sqlalchemy import func

    from ..models.pick import Pick

    q = db.query(func.count(Pick.id)).filter(Pick.order_id == int(order_id))
    if cart_id is not None:
        q = q.filter(Pick.cart_id == int(cart_id))
    return int(q.scalar() or 0) > 0


def can_detach_order_from_cart(
    db: Session,
    *,
    cart: Cart,
    order: Order,
) -> tuple[bool, str | None]:
    """
    Reguły odłączenia pojedynczego zamówienia:
    - READY_FOR_PACKING / PACKING → zablokowane (kompletacja zakończona / trwa pakowanie)
    - istnieją Pick dla zamówienia na tym wózku → zablokowane
    """
    st = get_cart_status(cart)
    if st in (CartStatus.READY_FOR_PACKING, CartStatus.PACKING):
        return False, ORDER_DETACH_BLOCKED_MSG
    if order_has_picking_progress(db, order_id=int(order.id), cart_id=int(cart.id)):
        return False, ORDER_DETACH_BLOCKED_MSG
    return True, None


def detach_order_from_cart(
    db: Session,
    *,
    cart_id: int,
    order_id: int,
    tenant_id: int,
    warehouse_id: int,
    operator_user_id: int | None = None,
    reason: str | None = None,
) -> dict[str, Any]:
    """
    Kanoniczne odłączenie jednego zamówienia od wózka (operator / admin / System).

    ``operator_user_id=None`` = actor System (audit bez usera) — ta sama ścieżka lifecycle,
    bez obchodzenia przez bezpośrednie clear pól.
    """
    from .cart_capacity.engine import order_volume_dm3
    from .cart_display import cart_display_name_for_wms
    from .cart_stats_service import activity_orders_meta, format_orders_operation_description

    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None

    cart = _lock_cart_by_keys(
        db,
        cart_id=int(cart_id),
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
    )
    on_cart = _orders_on_cart(db, int(cart_id))
    target = next((o for o in on_cart if int(o.id) == int(order_id)), None)
    if target is None:
        raise CartLifecycleError(
            "Zamówienie nie jest przypisane do tego wózka.",
            code="OrderNotOnCart",
        )

    allowed, block_reason = can_detach_order_from_cart(db, cart=cart, order=target)
    if not allowed:
        raise CartLifecycleError(
            block_reason or ORDER_DETACH_BLOCKED_MSG,
            code="OrderDetachBlocked",
        )

    snapshot = [target]
    remaining = [o for o in on_cart if int(o.id) != int(order_id)]

    clear_order_picking_session_context(target)
    if (getattr(target, "status", None) or "").upper() in (
        "PICKING",
        "PICKING_IN_PROGRESS",
    ):
        target.status = "NEW"
    if (getattr(target, "fulfillment_state", None) or "").upper() == FS_PICKING:
        target.fulfillment_state = None
    target.picking_started_at = None
    target.total_volume_dm3 = None
    db.add(target)

    # Free MULTI basket slot if linked
    for basket in list(getattr(cart, "baskets", None) or []):
        if getattr(basket, "order_id", None) is not None and int(basket.order_id) == int(order_id):
            basket.order_id = None
            basket.used_volume = 0.0
            db.add(basket)

    # Detach draft picks for this order on this cart (no confirmed progress by guard)
    try:
        from ..models.pick import Pick

        db.query(Pick).filter(
            Pick.cart_id == int(cart_id),
            Pick.order_id == int(order_id),
            Pick.picked_at.is_(None),
        ).delete(synchronize_session=False)
    except Exception:
        logger.exception(
            "detach_order draft picks cleanup failed cart_id=%s order_id=%s",
            cart_id,
            order_id,
        )

    cart.used_volume = round(sum(order_volume_dm3(o) for o in remaining), 2)
    db.add(cart)

    released = False
    if not remaining:
        # Empty cart → release (same as clear_basket last order); not a bulk admin release.
        release_cart(db, cart=cart, reason="order_detached_last", _already_locked=True)
        released = True
    else:
        st = get_cart_status(cart)
        if st == CartStatus.PICKING:
            apply_cart_transition(
                db,
                cart,
                CartStatus.PICKING,
                operator_user_id=uid,
                reason="order_detached",
                total_orders=len(remaining),
                metadata={"detached_order_id": int(order_id)},
            )

    cart_label = cart_display_name_for_wms(cart)
    default_reason = (
        "Automatyczne odłączenie zamówienia (System) — Walidacja WMS."
        if uid is None
        else "Ręczne odłączenie zamówienia z panelu administracyjnego."
    )
    meta = {
        **activity_orders_meta(snapshot, show_order_numbers=True),
        "reason": (reason or default_reason),
        "remaining_orders": len(remaining),
        "cart_released": released,
        "cart_label": cart_label,
        "actor": "system" if uid is None else "operator",
    }
    _record_event(
        db,
        cart,
        "order_detached",
        operator_user_id=uid,
        order_id=int(order_id),
        description=format_orders_operation_description(
            "Odłączono",
            snapshot,
            for_activity_log=True,
            cart_relation="od",
        ),
        metadata=meta,
    )
    _after_mutation(db, cart)
    logger.info(
        "cart_lifecycle.detach_order cart_id=%s order_id=%s remaining=%s released=%s",
        int(cart_id),
        int(order_id),
        len(remaining),
        released,
    )
    return {
        "cart_id": int(cart_id),
        "order_id": int(order_id),
        "orders_detached": 1,
        "remaining_orders": len(remaining),
        "cart_status": get_cart_status(cart).value,
        "cart_released": released,
    }


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
    """
    Liczniki SKU w sesji.

    SHORTAGE (remaining≈0, missing>0) → ``braki``, NIGDY ``zebrane``.
    COMPLETED_PICK (remaining≈0, missing≈0) → ``zebrane``.
    """
    zebrane = 0
    do_zebrania = 0
    w_trakcie = 0
    braki = 0
    for ln in lines:
        total = float(getattr(ln, "total_quantity", 0) or 0)
        picked = float(getattr(ln, "picked_quantity", 0) or 0)
        missing = float(getattr(ln, "missing_quantity", 0) or 0)
        remaining = float(getattr(ln, "remaining_to_pick", None) or 0)
        status = getattr(ln, "resolution_status", None)
        if status is None:
            if remaining > 1e-9:
                status = "PARTIAL" if (picked > 1e-9 or missing > 1e-9) else "ACTIVE"
            elif missing > 1e-9:
                status = "SHORTAGE"
            else:
                status = "COMPLETED_PICK"
        if status == "SHORTAGE" or (remaining <= 1e-9 and missing > 1e-9):
            braki += 1
        elif remaining <= 1e-9 and (picked + 1e-9 >= total or total <= 1e-9 or status == "COMPLETED_PICK"):
            zebrane += 1
        elif picked <= 1e-9 and missing <= 1e-9:
            do_zebrania += 1
        else:
            w_trakcie += 1
    return {"zebrane": zebrane, "do_zebrania": do_zebrania, "w_trakcie": w_trakcie, "braki": braki}


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
    # NEWEST → OLDEST (SSOT aligned with Activity Log / order_activity_logs)
    out: list[dict[str, Any]] = []
    for r in rows:
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
adminReleaseCart = admin_release_cart


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
