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
from . import error_codes as ec
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
    "SERIES_DESTINATION_SWITCHED",
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


def _lock_session_for_put(db: Session, sess: WmsOperationSession) -> WmsOperationSession:
    """
    Serialize pending/series/Pick mutations on one cart session.

    Without FOR UPDATE, two rapid product scans (or two operators) can both read
    pending=NULL / same series and double-create pending or double Pick.
    """
    locked = (
        db.query(WmsOperationSession)
        .filter(WmsOperationSession.id == int(sess.id))
        .with_for_update()
        .first()
    )
    if locked is None:
        raise BasketPutError(
            "CART_NOT_ACTIVE",
            "Brak aktywnej sesji zbierania dla tego wózka.",
            http_status=409,
        )
    return locked


def _audit(event: str, **fields: Any) -> None:
    logger.info(
        "%s %s",
        event,
        " ".join(f"{k}={v!r}" for k, v in fields.items()),
    )
    # Compact ops trace (no PII) — correlates with FE MULTI_SCAN_TRACE.
    if event in (
        "PRODUCT_SCAN_PENDING_PUT",
        "BASKET_CONFIRMED",
        "MANUAL_BASKET_CONFIRMATION",
        "BASKET_SERIES_DESTINATION_SWITCHED",
        "BASKET_PRODUCT_MISMATCH",
        "BASKET_MISMATCH",
        "PUT_CONFIRMED",
    ):
        logger.info(
            "MULTI_SCAN_TRACE event=%s %s",
            event,
            " ".join(f"{k}={v}" for k, v in fields.items() if v is not None),
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
    product_id: int | None = None,
    order_ids: list[int] | None = None,
    sanitize: bool = True,
) -> dict[str, Any]:
    """
    Read pending/series for UI.

    When ``product_id`` is set (product detail), series/pending for a *different*
    SKU are hidden. Invalid series (allocation gone) is cleared when ``sanitize``.
    """
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

    # Product-scoped view: never show another SKU's series/pending on this detail.
    if product_id is not None and pending is not None:
        if int(pending.get("product_id") or 0) != int(product_id):
            pending = None
    if product_id is not None and series is not None:
        if int(series.get("product_id") or 0) != int(product_id):
            series = None

    if sanitize and series is not None and product_id is not None:
        series = _sanitize_series_allocation(
            db,
            sess=sess,
            cart=cart,
            series=series,
            product_id=int(product_id),
            order_ids=list(order_ids or []),
        )

    # LIVE line_remaining for UI — never trust a snapshot stored in series metadata.
    if series is not None:
        projected = project_active_series_with_live_remaining(
            db,
            cart=cart,
            series=series,
            order_ids=list(order_ids or []),
        )
        if projected is not None:
            series = projected

    return {
        "requires_basket_put": True,
        "pending": pending,
        "active_series": series,
    }


def project_active_series_with_live_remaining(
    db: Session,
    *,
    cart: Cart,
    series: dict[str, Any] | None,
    order_ids: list[int] | None = None,
) -> dict[str, Any] | None:
    """
    View projection: copy series + LIVE ``line_remaining`` for the bound allocation.

    Does not mutate session metadata. Returns None when allocation is no longer open
    (caller deciding whether to clear metadata is separate — see sanitize).
    """
    if not isinstance(series, dict) or not series.get("product_id"):
        return None
    oid_scope = list(order_ids or [])
    if not oid_scope and series.get("order_id"):
        oid_scope = [int(series["order_id"])]
    alloc = resolve_allocation_for_series(
        db,
        cart=cart,
        order_ids=oid_scope,
        product_id=int(series["product_id"]),
        order_item_id=int(series.get("order_item_id") or 0),
        basket_id=int(series.get("basket_id") or 0),
    )
    if alloc is None:
        return None
    out = dict(series)
    out["line_remaining"] = float(alloc.line_remaining)
    return out


def _sanitize_series_allocation(
    db: Session,
    *,
    sess: WmsOperationSession,
    cart: Cart,
    series: dict[str, Any],
    product_id: int,
    order_ids: list[int],
) -> dict[str, Any] | None:
    """Clear series when allocation is no longer open for this product/basket/line."""
    oid_scope = list(order_ids or [])
    if not oid_scope and series.get("order_id"):
        oid_scope = [int(series["order_id"])]
    alloc = resolve_allocation_for_series(
        db,
        cart=cart,
        order_ids=oid_scope,
        product_id=int(product_id),
        order_item_id=int(series.get("order_item_id") or 0),
        basket_id=int(series.get("basket_id") or 0),
    )
    if alloc is None:
        put_state.set_active_series(db, sess, None)
        _audit(
            "BASKET_SERIES_CLEARED",
            session_id=getattr(sess, "id", None),
            reason="stale_series_revalidate",
            product_id=product_id,
            previous_basket=series.get("basket_label"),
        )
        return None
    return series


def enrich_pending_for_list_ui(
    db: Session,
    *,
    tenant_id: int,
    pending: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Attach product name/ean/sku for list banner. Pending without enrichment stays None."""
    if not isinstance(pending, dict) or not pending.get("product_id"):
        return None
    from ...models.product import Product

    pid = int(pending["product_id"])
    pr = (
        db.query(Product)
        .filter(Product.id == pid, Product.tenant_id == int(tenant_id))
        .first()
    )
    return {
        "product_id": pid,
        "product_name": (pr.name if pr and pr.name else f"Produkt #{pid}"),
        "ean": (pr.ean if pr else None),
        "sku": (pr.sku if pr else None),
        "quantity": float(pending.get("quantity") or 1),
        "idempotency_key": pending.get("idempotency_key"),
        "location_id": pending.get("location_id"),
        "eligible_baskets": pending.get("eligible_baskets") or [],
        "operator_user_id": pending.get("operator_user_id"),
    }


def project_basket_put_for_product_lines(
    db: Session,
    *,
    cart: Cart | None,
    tenant_id: int,
    operator_user_id: int | None = None,
) -> dict[str, Any]:
    """List projection: pending ≠ series. Series alone never fills basket_put_pending."""
    if cart is None or not cart_requires_basket_put_gate(cart):
        return {
            "requires_basket_put_confirm": False,
            "basket_put_pending": None,
            "basket_put_active_series": None,
        }
    ui = get_basket_put_ui_state(db, cart=cart, operator_user_id=operator_user_id)
    return {
        "requires_basket_put_confirm": bool(ui.get("requires_basket_put")),
        "basket_put_pending": enrich_pending_for_list_ui(
            db, tenant_id=int(tenant_id), pending=ui.get("pending")
        ),
        "basket_put_active_series": ui.get("active_series"),
    }


def cancel_pending_basket_put(
    db: Session,
    *,
    cart: Cart,
    operator_user_id: int | None,
) -> dict[str, Any]:
    """
    Clear product-level pending only. Never mutates Pick / stock / order_item / series.
    """
    sess = _lock_session_for_put(db, assert_cart_ready_for_quick_pick(db, cart))
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    pending = put_state.get_pending(sess)
    if pending is None:
        raise BasketPutError(
            "NO_PENDING_PUT",
            "Brak oczekującego odłożenia do anulowania.",
            http_status=409,
        )
    pend_uid = int(pending.get("operator_user_id") or 0)
    if uid is not None and pend_uid and pend_uid != uid:
        raise BasketPutError(
            "BASKET_PUT_OWNED_BY_OTHER",
            "To oczekujące odłożenie należy do innego operatora.",
            http_status=409,
        )
    put_state.set_pending(db, sess, None)
    _audit(
        "PENDING_PUT_CANCELLED",
        session_id=sess.id,
        operator=uid,
        product_id=pending.get("product_id"),
        quantity=pending.get("quantity"),
        series_untouched=bool(put_state.get_active_series(sess)),
    )
    return {
        "ok": True,
        "cleared": True,
        "product_id": int(pending["product_id"]) if pending.get("product_id") else None,
        "quantity": float(pending.get("quantity") or 0),
        "active_series": put_state.get_active_series(sess),
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
    sess = _lock_session_for_put(db, assert_cart_ready_for_quick_pick(db, cart))
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
        # Any existing pending blocks another product scan — basket must resolve first.
        # Re-read eligible from live DB (pending.eligible_baskets is UI hint only).
        live = list_eligible_basket_allocations(
            db, cart=cart, order_ids=order_ids, product_id=int(pending.get("product_id") or product_id)
        )
        eligible = eligible_baskets_payload(live) if live else (pending.get("eligible_baskets") or [])
        labels = _eligible_labels(eligible if isinstance(eligible, list) else [])
        _audit(
            "PRODUCT_SCAN_WHILE_PENDING",
            session_id=sess.id,
            operator=uid,
            product_id=product_id,
            eligible_baskets=labels,
        )
        raise BasketPutError(
            ec.EXPECTED_BASKET_SCAN,
            ec.operator_message(ec.EXPECTED_BASKET_SCAN),
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
                series_out = None
            else:
                series_out = project_active_series_with_live_remaining(
                    db,
                    cart=cart,
                    series=put_state.get_active_series(sess),
                    order_ids=order_ids,
                )
            return BasketPutResult(
                phase="PUT_CONFIRMED",
                order_id=int(oid),
                order_item_id=int(oiid),
                quantity_put=float(take),
                active_series=series_out,
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


def _find_basket_on_other_cart(db: Session, *, cart: Cart, basket_scan: str) -> CartBasket | None:
    """If barcode matches a basket not on this cart → BASKET_OTHER_CART."""
    # Bound search: match by exact barcode / scan_code first (production brck1-B0x).
    s = (basket_scan or "").strip()
    if not s:
        return None
    cid = int(cart.id)
    candidates = (
        db.query(CartBasket)
        .filter(
            CartBasket.cart_id != cid,
            (
                (CartBasket.barcode == s)
                | (CartBasket.scan_code == s)
                | (CartBasket.name == s)
            ),
        )
        .limit(20)
        .all()
    )
    for b in candidates:
        if basket_scan_matches(b, basket_scan):
            return b
    # Fallback: small sample of foreign baskets (tests / odd labels)
    foreign = (
        db.query(CartBasket)
        .filter(CartBasket.cart_id != cid)
        .limit(200)
        .all()
    )
    for b in foreign:
        if basket_scan_matches(b, basket_scan):
            return b
    return None


def _basket_has_assigned_order(db: Session, *, cart: Cart, basket: CartBasket) -> bool:
    from ...models.order import Order

    if getattr(basket, "order_id", None) is not None:
        return True
    row = (
        db.query(Order.id)
        .filter(Order.cart_id == int(cart.id), Order.basket_id == int(basket.id))
        .first()
    )
    return row is not None


def _raise_unknown_basket(
    db: Session,
    *,
    cart: Cart,
    basket_scan: str,
    sess: WmsOperationSession,
    uid: int | None,
    product_id: int | None,
    pending: dict[str, Any] | None,
    oid_scope: list[int],
) -> None:
    foreign = _find_basket_on_other_cart(db, cart=cart, basket_scan=basket_scan)
    if foreign is not None:
        raise BasketPutError(
            ec.BASKET_OTHER_CART,
            ec.operator_message(ec.BASKET_OTHER_CART),
            http_status=409,
            extra={
                "phase": "BASKET_OTHER_CART",
                "scanned_basket": (basket_scan or "").strip(),
            },
        )
    live = (
        list_eligible_basket_allocations(db, cart=cart, order_ids=oid_scope, product_id=int(product_id))
        if product_id and oid_scope
        else []
    )
    eligible = eligible_baskets_payload(live) if live else ((pending or {}).get("eligible_baskets") or [])
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
        ec.BASKET_MISMATCH,
        ec.operator_message(ec.BASKET_MISMATCH),
        http_status=409,
        extra={
            "phase": "BASKET_MISMATCH",
            "scanned_basket": scanned_label,
            "eligible_baskets": eligible,
            "pending": pending,
        },
    )


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
    """
    Basket scan either:
    - confirms an existing product pending → Pick + series, or
    - retargets active series destination → NO Pick (qty unchanged).

    Basket scan alone never invents a product unit / never increments picked qty
    without a prior product pending (or series product-scan path).
    """
    sess = _lock_session_for_put(db, assert_cart_ready_for_quick_pick(db, cart))
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    pending = put_state.get_pending(sess)
    oid_scope = list(order_ids or [])

    # --- Series destination switch (no pending, no Pick) ---
    if pending is None:
        series = put_state.get_active_series(sess)
        if series is None:
            raise BasketPutError(
                "NO_PENDING_PUT",
                "Brak oczekującego odłożenia — najpierw zeskanuj produkt.",
                http_status=409,
            )
        ser_uid = int(series.get("operator_user_id") or 0)
        if uid is not None and ser_uid and ser_uid != uid:
            raise BasketPutError(
                "BASKET_PUT_OWNED_BY_OTHER",
                "Aktywna seria należy do innego operatora.",
                http_status=409,
            )
        # Stale series (line exhausted / basket reassigned) → clear; do not invent Pick.
        oid_scope_chk = list(oid_scope or [])
        if not oid_scope_chk and series.get("order_id"):
            oid_scope_chk = [int(series["order_id"])]
        if (
            resolve_allocation_for_series(
                db,
                cart=cart,
                order_ids=oid_scope_chk,
                product_id=int(series["product_id"]),
                order_item_id=int(series.get("order_item_id") or 0),
                basket_id=int(series.get("basket_id") or 0),
            )
            is None
        ):
            put_state.set_active_series(db, sess, None)
            _audit(
                "BASKET_SERIES_CLEARED",
                session_id=sess.id,
                reason="stale_series_on_basket_scan",
                previous_basket=series.get("basket_label"),
            )
            raise BasketPutError(
                "NO_PENDING_PUT",
                "Seria odkładania wygasła — najpierw zeskanuj produkt.",
                http_status=409,
                extra={"phase": "SERIES_STALE_CLEARED"},
            )
        scanned = _find_scanned_basket(db, cart=cart, basket_scan=basket_scan)
        if scanned is None:
            _raise_unknown_basket(
                db,
                cart=cart,
                basket_scan=basket_scan,
                sess=sess,
                uid=uid,
                product_id=int(series["product_id"]) if series.get("product_id") else None,
                pending=None,
                oid_scope=list(oid_scope or []),
            )
        if not _basket_has_assigned_order(db, cart=cart, basket=scanned):
            raise BasketPutError(
                ec.BASKET_EMPTY,
                ec.operator_message(ec.BASKET_EMPTY),
                http_status=409,
                extra={"phase": "BASKET_EMPTY", "scanned_basket": primary_basket_label(scanned)},
            )
        scanned_label = primary_basket_label(scanned)
        if int(scanned.id) == int(series.get("basket_id") or 0):
            # Same basket — no-op for destination; still no Pick without product.
            raise BasketPutError(
                ec.NO_PENDING_PUT,
                f"Seria już wskazuje koszyk {scanned_label}. Zeskanuj EAN produktu, aby odłożyć kolejną sztukę.",
                http_status=409,
                extra={"phase": "SERIES_ACTIVE", "active_series": series},
            )
        if not oid_scope and series.get("order_id"):
            # Prefer full cohort from caller; series order alone is insufficient for multi-order SKU.
            oid_scope = [int(series["order_id"])]
        allocation, err = resolve_allocation_for_basket_scan(
            db,
            cart=cart,
            order_ids=oid_scope,
            product_id=int(series["product_id"]),
            basket=scanned,
        )
        if err == "BASKET_PRODUCT_MISMATCH" or allocation is None:
            raise BasketPutError(
                "BASKET_PRODUCT_MISMATCH",
                f"Koszyk {scanned_label} nie przyjmuje aktywnej serii produktu "
                f"(product_id={series.get('product_id')}). "
                f"Zeskanuj EAN właściwego produktu, potem koszyk — albo odłóż serię.",
                http_status=409,
                extra={
                    "phase": "BASKET_PRODUCT_MISMATCH",
                    "scanned_basket": scanned_label,
                    "series_product_id": series.get("product_id"),
                    "series_basket_label": series.get("basket_label"),
                },
            )
        if err == "BASKET_PRODUCT_ALREADY_COMPLETE":
            raise BasketPutError(
                "BASKET_PRODUCT_ALREADY_COMPLETE",
                f"Koszyk {scanned_label} ma już komplet tego produktu.",
                http_status=409,
                extra={"phase": "BASKET_PRODUCT_ALREADY_COMPLETE", "scanned_basket": scanned_label},
            )
        new_series = {
            "operator_user_id": uid if uid is not None else series.get("operator_user_id"),
            "product_id": int(series["product_id"]),
            "order_id": int(allocation.order_id),
            "order_item_id": int(allocation.order_item_id),
            "basket_id": int(allocation.basket_id),
            "basket_label": allocation.basket_label,
            "location_id": int(series["location_id"]),
            "activated_at": put_state.utc_now_iso(),
        }
        put_state.set_active_series(db, sess, new_series)
        series_out = project_active_series_with_live_remaining(
            db,
            cart=cart,
            series=new_series,
            order_ids=list(oid_scope or []),
        ) or {**new_series, "line_remaining": float(allocation.line_remaining)}
        _audit(
            "BASKET_SERIES_DESTINATION_SWITCHED",
            session_id=sess.id,
            operator=uid,
            previous_basket=series.get("basket_label"),
            next_basket=allocation.basket_label,
            product_id=series.get("product_id"),
            quantity_put=0,
            line_remaining=series_out.get("line_remaining"),
        )
        return BasketPutResult(
            phase="SERIES_DESTINATION_SWITCHED",
            order_id=int(allocation.order_id),
            order_item_id=int(allocation.order_item_id),
            quantity_put=0.0,
            active_series=series_out,
            expected_basket_label=allocation.basket_label,
            scanned_basket=scanned_label,
            message=(
                f"Zmieniono koszyk docelowy serii na {allocation.basket_label}. "
                f"Qty bez zmian — zeskanuj EAN, aby odłożyć kolejną sztukę."
            ),
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
        _raise_unknown_basket(
            db,
            cart=cart,
            basket_scan=basket_scan,
            sess=sess,
            uid=uid,
            product_id=product_id,
            pending=pending,
            oid_scope=list(oid_scope or []),
        )
    assert scanned is not None
    if not _basket_has_assigned_order(db, cart=cart, basket=scanned):
        raise BasketPutError(
            ec.BASKET_EMPTY,
            ec.operator_message(ec.BASKET_EMPTY),
            http_status=409,
            extra={"phase": "BASKET_EMPTY", "scanned_basket": primary_basket_label(scanned)},
        )

    scanned_label = primary_basket_label(scanned)
    # Authorization SSOT: live DB resolve — never trust pending.eligible_baskets alone.
    if not oid_scope:
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
        live = (
            list_eligible_basket_allocations(db, cart=cart, order_ids=oid_scope, product_id=product_id)
            if oid_scope
            else []
        )
        eligible = eligible_baskets_payload(live) if live else (pending.get("eligible_baskets") or [])
        labels = _eligible_labels(eligible if isinstance(eligible, list) else [])
        _audit(
            "BASKET_PRODUCT_MISMATCH",
            session_id=sess.id,
            operator=uid,
            scanned_basket=scanned_label,
            product_id=product_id,
        )
        raise BasketPutError(
            ec.BASKET_PRODUCT_MISMATCH,
            (
                f"{ec.operator_message(ec.BASKET_PRODUCT_MISMATCH)} "
                f"Koszyk {scanned_label}. Oczekiwane: {labels}."
            ),
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
    series_out = project_active_series_with_live_remaining(
        db,
        cart=cart,
        series=series,
        order_ids=list(oid_scope or []),
    )
    # If pick exhausted the line, live resolve returns None — still report 0 for this response
    # without clearing metadata here (existing sanitize / next product-scan SSOT clears).
    if series_out is None:
        rem_after = float(allocation.line_remaining) - float(qty)
        series_out = {**series, "line_remaining": max(0.0, rem_after)}
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
        active_series=series_out,
        expected_basket_label=allocation.basket_label,
        scanned_basket=scanned_label,
        message=f"KOSZYK {allocation.basket_label} POTWIERDZONY. Odłożono {qty:g} szt.",
    )
