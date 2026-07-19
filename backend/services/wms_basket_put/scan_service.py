"""
Basket put confirmation state machine for MULTI / baskets carts.

PRODUCT_SCAN → AWAITING_BASKET_CONFIRMATION → BASKET_SCAN → PUT_CONFIRMED
Series: after basket verified for (product, order_item, basket), further product
scans increment without re-scanning basket until destination context changes.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy.orm import Session, joinedload

from ...models.cart import Cart
from ...models.cart_basket import CartBasket
from ...models.wms_operation_session import WmsOperationSession
from ..cart_picking_lifecycle_service import assert_cart_ready_for_quick_pick
from .basket_match import basket_scan_matches, primary_basket_label
from .resolve import BasketPutAllocation, cart_is_baskets_mode, resolve_next_basket_allocation
from . import state as put_state

logger = logging.getLogger(__name__)


class BasketPutError(Exception):
    def __init__(self, code: str, message: str, *, http_status: int = 409, extra: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status
        self.extra = extra or {}

    def as_detail(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, **self.extra}


PutPhase = Literal[
    "PUT_CONFIRMED",
    "AWAITING_BASKET_CONFIRMATION",
    "BASKET_MISMATCH",
    "AWAITING_BASKET_STILL",
]


@dataclass
class BasketPutResult:
    phase: PutPhase
    order_id: int | None = None
    order_item_id: int | None = None
    quantity_put: float = 0.0
    pending: dict[str, Any] | None = None
    active_series: dict[str, Any] | None = None
    expected_basket_label: str | None = None
    scanned_basket: str | None = None
    message: str | None = None


def cart_requires_basket_put_gate(cart: Cart) -> bool:
    return cart_is_baskets_mode(cart)


def _audit(event: str, **fields: Any) -> None:
    logger.info(
        "%s %s",
        event,
        " ".join(f"{k}={v!r}" for k, v in fields.items()),
    )


def _series_matches(
    series: dict[str, Any],
    *,
    operator_user_id: int | None,
    allocation: BasketPutAllocation,
    location_id: int,
) -> bool:
    if operator_user_id is not None and int(series.get("operator_user_id") or 0) != int(operator_user_id):
        return False
    return (
        int(series.get("product_id") or 0) == int(allocation.product_id)
        and int(series.get("order_item_id") or 0) == int(allocation.order_item_id)
        and int(series.get("order_id") or 0) == int(allocation.order_id)
        and int(series.get("basket_id") or 0) == int(allocation.basket_id)
        and int(series.get("location_id") or 0) == int(location_id)
    )


def clear_basket_put_state(
    db: Session,
    *,
    cart: Cart | None = None,
    session: WmsOperationSession | None = None,
    reason: str = "clear",
) -> None:
    sess = session
    if sess is None and cart is not None:
        try:
            sess = assert_cart_ready_for_quick_pick(db, cart)
        except Exception:
            return
    if sess is None:
        return
    put_state.clear_all(db, sess, reason=reason)


def get_basket_put_ui_state(
    db: Session,
    *,
    cart: Cart,
    operator_user_id: int | None = None,
) -> dict[str, Any]:
    if not cart_requires_basket_put_gate(cart):
        return {"requires_basket_put": False, "pending": None, "active_series": None}
    try:
        sess = assert_cart_ready_for_quick_pick(db, cart)
    except Exception:
        return {"requires_basket_put": True, "pending": None, "active_series": None}
    pending = put_state.get_pending(sess)
    series = put_state.get_active_series(sess)
    if pending and operator_user_id is not None:
        if int(pending.get("operator_user_id") or 0) != int(operator_user_id):
            pending = None
    if series and operator_user_id is not None:
        if int(series.get("operator_user_id") or 0) != int(operator_user_id):
            series = None
    return {
        "requires_basket_put": True,
        "pending": pending,
        "active_series": series,
    }


def handle_product_scan_for_baskets(
    db: Session,
    *,
    cart: Cart,
    order_ids: list[int],
    product_id: int,
    location_id: int,
    quantity: float,
    operator_user_id: int | None,
    record_pick_fn,
) -> BasketPutResult:
    """
    Gate before writing picks for baskets carts.

    ``record_pick_fn`` — callable that performs the actual Pick write
    (typically wrapping ``record_wms_quick_pick`` for qty=1 or requested qty).
    Called only when put is authorized (series or after basket confirm path elsewhere).
    """
    sess = assert_cart_ready_for_quick_pick(db, cart)
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None

    pending = put_state.get_pending(sess)
    if pending is not None:
        pend_uid = int(pending.get("operator_user_id") or 0)
        if uid is not None and pend_uid and pend_uid != uid:
            raise BasketPutError(
                "BASKET_PUT_OWNED_BY_OTHER",
                "Inny operator ma nierozliczone odłożenie do koszyka na tej sesji.",
                http_status=409,
            )
        if uid is not None and pend_uid and pend_uid == uid:
            exp = str(pending.get("expected_basket_label") or "")
            _audit(
                "PRODUCT_SCAN_WHILE_PENDING",
                session_id=sess.id,
                operator=uid,
                product_id=product_id,
                expected_basket=exp,
            )
            raise BasketPutError(
                "AWAITING_BASKET_CONFIRMATION",
                f"NAJPIERW POTWIERDŹ KOSZYK. Odłóż produkt do koszyka {exp} i zeskanuj jego kod.",
                http_status=409,
                extra={
                    "phase": "AWAITING_BASKET_CONFIRMATION",
                    "expected_basket_label": exp,
                    "pending": pending,
                },
            )

    allocation = resolve_next_basket_allocation(
        db, cart=cart, order_ids=order_ids, product_id=int(product_id)
    )
    if allocation is None:
        raise BasketPutError(
            "NO_ALLOCATION",
            "Brak linii zamówienia wymagającej kompletacji tego produktu.",
            http_status=400,
        )

    series = put_state.get_active_series(sess)
    qty = max(float(quantity), 0.0)
    if qty <= 0:
        raise BasketPutError("INVALID_QTY", "Ilość musi być > 0.", http_status=400)

    if series and _series_matches(
        series, operator_user_id=uid, allocation=allocation, location_id=int(location_id)
    ):
        take = min(qty, float(allocation.line_remaining))
        oid, oiid = record_pick_fn(quantity=take, fixed_order_id=int(allocation.order_id))
        _audit(
            "PUT_CONFIRMED",
            session_id=sess.id,
            operator=uid,
            order_id=oid,
            product_id=product_id,
            basket=allocation.basket_label,
            quantity=take,
            via="series",
        )
        # If line exhausted, clear series so next SKU allocation can re-authorize.
        if float(allocation.line_remaining) - take <= 1e-9:
            put_state.set_active_series(db, sess, None)
            _audit("BASKET_SERIES_CLEARED", session_id=sess.id, reason="line_complete")
            series = None
        return BasketPutResult(
            phase="PUT_CONFIRMED",
            order_id=int(oid),
            order_item_id=int(oiid),
            quantity_put=float(take),
            active_series=put_state.get_active_series(sess),
            expected_basket_label=allocation.basket_label,
            message=f"Koszyk {allocation.basket_label} — odłożono {take:g} szt.",
        )

    # Destination changed vs previous series → clear
    if series is not None:
        put_state.set_active_series(db, sess, None)
        _audit(
            "BASKET_SERIES_CLEARED",
            session_id=sess.id,
            reason="destination_changed",
            previous_basket=series.get("basket_label"),
            next_basket=allocation.basket_label,
        )

    # Create pending put — do not increment picked qty yet.
    pending_qty = min(float(qty), float(allocation.line_remaining))
    pending_row = {
        "idempotency_key": str(uuid.uuid4()),
        "operator_user_id": uid,
        "product_id": int(product_id),
        "order_id": int(allocation.order_id),
        "order_item_id": int(allocation.order_item_id),
        "location_id": int(location_id),
        "expected_basket_id": int(allocation.basket_id),
        "expected_basket_label": allocation.basket_label,
        "quantity": float(pending_qty),
        "created_at": put_state.utc_now_iso(),
    }
    put_state.set_pending(db, sess, pending_row)
    _audit(
        "PRODUCT_SCAN_PENDING_PUT",
        session_id=sess.id,
        operator=uid,
        order_id=allocation.order_id,
        product_id=product_id,
        expected_basket=allocation.basket_label,
        quantity=pending_row["quantity"],
    )
    return BasketPutResult(
        phase="AWAITING_BASKET_CONFIRMATION",
        order_id=int(allocation.order_id),
        order_item_id=int(allocation.order_item_id),
        pending=pending_row,
        expected_basket_label=allocation.basket_label,
        message=(
            f"ODŁÓŻ PRODUKT DO KOSZYKA {allocation.basket_label}. "
            f"Zeskanuj koszyk, aby potwierdzić odłożenie {pending_row['quantity']:g} szt."
        ),
    )


def confirm_basket_put(
    db: Session,
    *,
    cart: Cart,
    basket_scan: str,
    operator_user_id: int | None,
    record_pick_fn,
    manual: bool = False,
) -> BasketPutResult:
    sess = assert_cart_ready_for_quick_pick(db, cart)
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    pending = put_state.get_pending(sess)
    if pending is None:
        raise BasketPutError(
            "NO_PENDING_PUT",
            "Brak oczekującego odłożenia — najpierw zeskanuj produkt.",
            http_status=409,
        )
    pend_uid = int(pending.get("operator_user_id") or 0)
    if uid is not None and pend_uid and pend_uid != uid:
        raise BasketPutError(
            "BASKET_PUT_OWNED_BY_OTHER",
            "To oczekujące odłożenie należy do innego operatora.",
            http_status=409,
        )

    expected_id = int(pending["expected_basket_id"])
    expected_label = str(pending.get("expected_basket_label") or "")
    basket = (
        db.query(CartBasket)
        .filter(CartBasket.id == expected_id, CartBasket.cart_id == int(cart.id))
        .first()
    )
    if basket is None:
        put_state.set_pending(db, sess, None)
        raise BasketPutError("BASKET_MISSING", "Oczekiwany koszyk nie istnieje na wózku.", http_status=409)

    if not basket_scan_matches(basket, basket_scan):
        # Try match against any cart basket to report scanned label
        scanned_label = (basket_scan or "").strip()
        all_b = (
            db.query(CartBasket)
            .filter(CartBasket.cart_id == int(cart.id))
            .all()
        )
        for b in all_b:
            if basket_scan_matches(b, basket_scan):
                scanned_label = primary_basket_label(b)
                break
        _audit(
            "BASKET_MISMATCH",
            session_id=sess.id,
            operator=uid,
            expected_basket=expected_label,
            scanned_basket=scanned_label,
            product_id=pending.get("product_id"),
            order_id=pending.get("order_id"),
        )
        raise BasketPutError(
            "BASKET_MISMATCH",
            f"NIEPRAWIDŁOWY KOSZYK. Oczekiwany: {expected_label}. Zeskanowany: {scanned_label}. Zeskanuj właściwy koszyk.",
            http_status=409,
            extra={
                "phase": "BASKET_MISMATCH",
                "expected_basket_label": expected_label,
                "scanned_basket": scanned_label,
                "pending": pending,
            },
        )

    qty = float(pending.get("quantity") or 1)
    oid, oiid = record_pick_fn(
        quantity=qty,
        fixed_order_id=int(pending["order_id"]),
    )
    event_confirm = "MANUAL_BASKET_CONFIRMATION" if manual else "BASKET_CONFIRMED"
    _audit(
        event_confirm,
        session_id=sess.id,
        operator=uid,
        order_id=oid,
        product_id=pending.get("product_id"),
        expected_basket=expected_label,
        scanned_basket=expected_label,
        quantity=qty,
    )
    series = {
        "operator_user_id": uid,
        "product_id": int(pending["product_id"]),
        "order_id": int(pending["order_id"]),
        "order_item_id": int(pending["order_item_id"]),
        "basket_id": int(expected_id),
        "basket_label": expected_label,
        "location_id": int(pending["location_id"]),
        "activated_at": put_state.utc_now_iso(),
    }
    put_state.set_pending(db, sess, None)
    put_state.set_active_series(db, sess, series)
    _audit(
        "BASKET_SERIES_ACTIVATED",
        session_id=sess.id,
        operator=uid,
        basket=expected_label,
        product_id=pending.get("product_id"),
        order_item_id=pending.get("order_item_id"),
    )
    _audit(
        "PUT_CONFIRMED",
        session_id=sess.id,
        operator=uid,
        order_id=oid,
        product_id=pending.get("product_id"),
        basket=expected_label,
        quantity=qty,
        via="basket_confirm",
    )
    return BasketPutResult(
        phase="PUT_CONFIRMED",
        order_id=int(oid),
        order_item_id=int(oiid),
        quantity_put=float(qty),
        active_series=series,
        expected_basket_label=expected_label,
        message=f"KOSZYK {expected_label} POTWIERDZONY. Odłożono {qty:g} szt.",
    )
