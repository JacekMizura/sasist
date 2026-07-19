"""
Basket put confirmation state machine for MULTI / baskets carts.

PRODUCT_SCAN → pending put (product-level, NO pick, NO forced order_item)
BASKET_SCAN → resolve order_item for that basket → Pick +1 → PUT_CONFIRMED
Series: after basket verified for (product, order_item, basket), further product
scans increment without re-scanning basket until that line is exhausted / context changes.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy.orm import Session

from ...models.cart import Cart
from ...models.cart_basket import CartBasket
from ...models.wms_operation_session import WmsOperationSession
from ..cart_picking_lifecycle_service import assert_cart_ready_for_quick_pick
from .basket_match import basket_scan_matches, primary_basket_label
from .resolve import (
    cart_is_baskets_mode,
    eligible_baskets_payload,
    list_eligible_basket_allocations,
    resolve_allocation_for_basket_scan,
    resolve_allocation_for_series,
)
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
    eligible_baskets: list[dict[str, Any]] | None = None
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


def _series_matches_product(
    series: dict[str, Any],
    *,
    operator_user_id: int | None,
    product_id: int,
    location_id: int,
) -> bool:
    if operator_user_id is not None and int(series.get("operator_user_id") or 0) != int(operator_user_id):
        return False
    return (
        int(series.get("product_id") or 0) == int(product_id)
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


def _eligible_labels(eligible: list[dict[str, Any]]) -> str:
    labels = [str(r.get("basket_label") or "") for r in eligible if r.get("basket_label")]
    return ", ".join(labels) if labels else "—"


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

    Product scan creates a product-level pending put (no Pick yet).
    Basket scan (``confirm_basket_put``) allocates to the correct order_item.

    ``record_pick_fn`` is called only when put is authorized (active series match
    or after basket confirm).
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
            eligible = pending.get("eligible_baskets") or []
            labels = _eligible_labels(eligible if isinstance(eligible, list) else [])
            _audit(
                "PRODUCT_SCAN_WHILE_PENDING",
                session_id=sess.id,
                operator=uid,
                product_id=product_id,
                eligible_baskets=labels,
            )
            raise BasketPutError(
                "AWAITING_BASKET_CONFIRMATION",
                f"NAJPIERW POTWIERDŹ KOSZYK. Zeskanuj jeden z koszyków: {labels}.",
                http_status=409,
                extra={
                    "phase": "AWAITING_BASKET_CONFIRMATION",
                    "eligible_baskets": eligible,
                    "pending": pending,
                },
            )

    eligible_allocs = list_eligible_basket_allocations(
        db, cart=cart, order_ids=order_ids, product_id=int(product_id)
    )
    if not eligible_allocs:
        raise BasketPutError(
            "NO_ALLOCATION",
            "Brak linii zamówienia wymagającej kompletacji tego produktu.",
            http_status=400,
        )

    qty = max(float(quantity), 0.0)
    if qty <= 0:
        raise BasketPutError("INVALID_QTY", "Ilość musi być > 0.", http_status=400)

    series = put_state.get_active_series(sess)
    if series and _series_matches_product(
        series, operator_user_id=uid, product_id=int(product_id), location_id=int(location_id)
    ):
        series_alloc = resolve_allocation_for_series(
            db,
            cart=cart,
            order_ids=order_ids,
            product_id=int(product_id),
            order_item_id=int(series["order_item_id"]),
            basket_id=int(series["basket_id"]),
        )
        if series_alloc is not None:
            take = min(qty, float(series_alloc.line_remaining))
            oid, oiid = record_pick_fn(quantity=take, scope_order_id=int(series_alloc.order_id))
            _audit(
                "PUT_CONFIRMED",
                session_id=sess.id,
                operator=uid,
                order_id=oid,
                product_id=product_id,
                basket=series_alloc.basket_label,
                quantity=take,
                via="series",
            )
            if float(series_alloc.line_remaining) - take <= 1e-9:
                put_state.set_active_series(db, sess, None)
                _audit("BASKET_SERIES_CLEARED", session_id=sess.id, reason="line_complete")
                series = None
            return BasketPutResult(
                phase="PUT_CONFIRMED",
                order_id=int(oid),
                order_item_id=int(oiid),
                quantity_put=float(take),
                active_series=put_state.get_active_series(sess),
                expected_basket_label=series_alloc.basket_label,
                message=f"Koszyk {series_alloc.basket_label} — odłożono {take:g} szt.",
            )
        # Series target exhausted / no longer eligible → clear and create fresh pending.
        put_state.set_active_series(db, sess, None)
        _audit("BASKET_SERIES_CLEARED", session_id=sess.id, reason="series_target_exhausted")
        series = None
        eligible_allocs = list_eligible_basket_allocations(
            db, cart=cart, order_ids=order_ids, product_id=int(product_id)
        )
        if not eligible_allocs:
            raise BasketPutError(
                "NO_ALLOCATION",
                "Brak linii zamówienia wymagającej kompletacji tego produktu.",
                http_status=400,
            )

    # Product changed vs previous series → clear (different SKU / location already handled above)
    if series is not None:
        put_state.set_active_series(db, sess, None)
        _audit(
            "BASKET_SERIES_CLEARED",
            session_id=sess.id,
            reason="destination_changed",
            previous_basket=series.get("basket_label"),
            product_id=product_id,
        )

    # Product-level pending — do NOT bind order_item / single expected basket yet.
    max_rem = max(float(a.line_remaining) for a in eligible_allocs)
    pending_qty = min(float(qty), max_rem)
    eligible_payload = eligible_baskets_payload(eligible_allocs)
    pending_row = {
        "idempotency_key": str(uuid.uuid4()),
        "operator_user_id": uid,
        "product_id": int(product_id),
        "location_id": int(location_id),
        "quantity": float(pending_qty),
        "eligible_baskets": eligible_payload,
        "created_at": put_state.utc_now_iso(),
    }
    put_state.set_pending(db, sess, pending_row)
    labels = _eligible_labels(eligible_payload)
    _audit(
        "PRODUCT_SCAN_PENDING_PUT",
        session_id=sess.id,
        operator=uid,
        product_id=product_id,
        eligible_baskets=labels,
        quantity=pending_row["quantity"],
    )
    return BasketPutResult(
        phase="AWAITING_BASKET_CONFIRMATION",
        pending=pending_row,
        eligible_baskets=eligible_payload,
        message=(
            f"Zeskanowano produkt — {pending_row['quantity']:g} szt. oczekuje na odłożenie. "
            f"Zeskanuj koszyk ({labels})."
        ),
    )


def _find_scanned_basket(db: Session, *, cart: Cart, basket_scan: str) -> CartBasket | None:
    all_b = (
        db.query(CartBasket)
        .filter(CartBasket.cart_id == int(cart.id))
        .all()
    )
    for b in all_b:
        if basket_scan_matches(b, basket_scan):
            return b
    return None


def confirm_basket_put(
    db: Session,
    *,
    cart: Cart,
    basket_scan: str,
    operator_user_id: int | None,
    record_pick_fn,
    manual: bool = False,
    order_ids: list[int] | None = None,
) -> BasketPutResult:
    sess = assert_cart_ready_for_quick_pick(db, cart)
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    pending = put_state.get_pending(sess)
    if pending is None:
        # Mid-series destination switch: scan another basket without a fresh product scan.
        series = put_state.get_active_series(sess)
        if series is not None:
            ser_uid = int(series.get("operator_user_id") or 0)
            if uid is None or not ser_uid or ser_uid == uid:
                scanned_try = _find_scanned_basket(db, cart=cart, basket_scan=basket_scan)
                if scanned_try is not None and int(scanned_try.id) != int(series.get("basket_id") or 0):
                    oid_scope = list(order_ids or [])
                    if not oid_scope and series.get("order_id"):
                        oid_scope = [int(series["order_id"])]
                    live = list_eligible_basket_allocations(
                        db,
                        cart=cart,
                        order_ids=oid_scope,
                        product_id=int(series["product_id"]),
                    )
                    pending = {
                        "idempotency_key": str(uuid.uuid4()),
                        "operator_user_id": uid,
                        "product_id": int(series["product_id"]),
                        "location_id": int(series["location_id"]),
                        "quantity": 1.0,
                        "eligible_baskets": eligible_baskets_payload(live),
                        "created_at": put_state.utc_now_iso(),
                        "via": "series_basket_switch",
                    }
                    put_state.set_active_series(db, sess, None)
                    put_state.set_pending(db, sess, pending)
                    _audit(
                        "BASKET_SERIES_CLEARED",
                        session_id=sess.id,
                        reason="operator_chose_other_basket",
                        previous_basket=series.get("basket_label"),
                        next_basket=primary_basket_label(scanned_try),
                    )
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

    product_id = int(pending["product_id"])
    scanned = _find_scanned_basket(db, cart=cart, basket_scan=basket_scan)
    if scanned is None:
        eligible = pending.get("eligible_baskets") or []
        labels = _eligible_labels(eligible if isinstance(eligible, list) else [])
        scanned_label = (basket_scan or "").strip()
        _audit(
            "BASKET_MISMATCH",
            session_id=sess.id,
            operator=uid,
            scanned_basket=scanned_label,
            product_id=product_id,
            eligible_baskets=labels,
        )
        raise BasketPutError(
            "BASKET_MISMATCH",
            f"Nieznany koszyk na tym wózku: {scanned_label}. Zeskanuj właściwy koszyk ({labels}).",
            http_status=409,
            extra={
                "phase": "BASKET_MISMATCH",
                "scanned_basket": scanned_label,
                "eligible_baskets": eligible,
                "pending": pending,
            },
        )

    scanned_label = primary_basket_label(scanned)
    oid_scope = order_ids
    if not oid_scope:
        # Fall back to pending eligible order ids + any order on this cart.
        elig = pending.get("eligible_baskets") or []
        oid_scope = [int(r["order_id"]) for r in elig if isinstance(r, dict) and r.get("order_id")]

    allocation, err = resolve_allocation_for_basket_scan(
        db,
        cart=cart,
        order_ids=list(oid_scope or []),
        product_id=product_id,
        basket=scanned,
    )
    if err == "BASKET_PRODUCT_MISMATCH" or (err is None and allocation is None):
        eligible = pending.get("eligible_baskets") or []
        labels = _eligible_labels(eligible if isinstance(eligible, list) else [])
        _audit(
            "BASKET_PRODUCT_MISMATCH",
            session_id=sess.id,
            operator=uid,
            scanned_basket=scanned_label,
            product_id=product_id,
        )
        raise BasketPutError(
            "BASKET_PRODUCT_MISMATCH",
            f"Ten produkt nie należy do zamówienia w koszyku {scanned_label}. "
            f"Zeskanuj właściwy koszyk ({labels}).",
            http_status=409,
            extra={
                "phase": "BASKET_PRODUCT_MISMATCH",
                "scanned_basket": scanned_label,
                "eligible_baskets": eligible,
                "pending": pending,
            },
        )
    if err == "BASKET_PRODUCT_ALREADY_COMPLETE":
        eligible = pending.get("eligible_baskets") or []
        # Refresh eligible from live state when possible
        if oid_scope:
            live = eligible_baskets_payload(
                list_eligible_basket_allocations(
                    db, cart=cart, order_ids=list(oid_scope), product_id=product_id
                )
            )
            if live:
                eligible = live
                pending = {**pending, "eligible_baskets": live}
                put_state.set_pending(db, sess, pending)
        labels = _eligible_labels(eligible if isinstance(eligible, list) else [])
        _audit(
            "BASKET_PRODUCT_ALREADY_COMPLETE",
            session_id=sess.id,
            operator=uid,
            scanned_basket=scanned_label,
            product_id=product_id,
        )
        raise BasketPutError(
            "BASKET_PRODUCT_ALREADY_COMPLETE",
            f"Koszyk {scanned_label} ma już komplet tego produktu. "
            f"Zeskanuj inny koszyk ({labels}).",
            http_status=409,
            extra={
                "phase": "BASKET_PRODUCT_ALREADY_COMPLETE",
                "scanned_basket": scanned_label,
                "eligible_baskets": eligible,
                "pending": pending,
            },
        )

    assert allocation is not None
    qty = min(float(pending.get("quantity") or 1), float(allocation.line_remaining))
    oid, oiid = record_pick_fn(
        quantity=qty,
        scope_order_id=int(allocation.order_id),
    )
    event_confirm = "MANUAL_BASKET_CONFIRMATION" if manual else "BASKET_CONFIRMED"
    _audit(
        event_confirm,
        session_id=sess.id,
        operator=uid,
        order_id=oid,
        product_id=product_id,
        scanned_basket=scanned_label,
        quantity=qty,
    )
    series = {
        "operator_user_id": uid,
        "product_id": int(product_id),
        "order_id": int(allocation.order_id),
        "order_item_id": int(allocation.order_item_id),
        "basket_id": int(allocation.basket_id),
        "basket_label": allocation.basket_label,
        "location_id": int(pending["location_id"]),
        "activated_at": put_state.utc_now_iso(),
    }
    put_state.set_pending(db, sess, None)
    put_state.set_active_series(db, sess, series)
    _audit(
        "BASKET_SERIES_ACTIVATED",
        session_id=sess.id,
        operator=uid,
        basket=allocation.basket_label,
        product_id=product_id,
        order_item_id=allocation.order_item_id,
    )
    _audit(
        "PUT_CONFIRMED",
        session_id=sess.id,
        operator=uid,
        order_id=oid,
        product_id=product_id,
        basket=allocation.basket_label,
        quantity=qty,
        via="basket_confirm",
    )
    return BasketPutResult(
        phase="PUT_CONFIRMED",
        order_id=int(oid),
        order_item_id=int(oiid),
        quantity_put=float(qty),
        active_series=series,
        expected_basket_label=allocation.basket_label,
        scanned_basket=scanned_label,
        message=f"KOSZYK {allocation.basket_label} POTWIERDZONY. Odłożono {qty:g} szt.",
    )
