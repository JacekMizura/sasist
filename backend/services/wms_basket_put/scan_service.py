"""
Basket put confirmation state machine for MULTI / baskets carts.

SELECTED PRODUCT CONTEXT (detail product_id) is independent of PHYSICAL QTY (pending).

- Product EAN (list or detail) → pending qty=1 (unassigned physical unit), NO Pick.
- Basket + pending → resolve order_item → Pick + consume pending → series.
- Basket + product context, no pending, no series → activate series destination, Pick=0.
- Basket + active series → retarget destination, Pick=0.
- Product EAN + active series → Pick +1 to series basket.
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
from ..cart_picking_lifecycle_service import (
    assert_cart_ready_for_quick_pick,
    find_open_picking_session,
)
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
    "SERIES_ACTIVATED",
    "QUANTITY_REQUIRED",
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

    Read path uses ``find_open_picking_session`` (not assert) so a transient
    lifecycle hiccup cannot hide an existing pending and force STATE A on detail.
    """
    if not cart_requires_basket_put_gate(cart):
        return {"requires_basket_put": False, "pending": None, "active_series": None}
    sess = find_open_picking_session(db, cart=cart)
    if sess is None:
        try:
            sess = assert_cart_ready_for_quick_pick(db, cart)
        except Exception:
            logger.warning(
                "basket_put ui: no open picking session cart_id=%s",
                getattr(cart, "id", None),
            )
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
    eligible_payload = eligible_baskets_payload(eligible_allocs, db=db)
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
    """Resolve scan → basket. Prefer barcode/scan_code over ambiguous S-row-col aliases."""
    from .basket_match import norm_basket_scan, primary_basket_label

    all_b = (
        db.query(CartBasket)
        .filter(CartBasket.cart_id == int(cart.id))
        .order_by(CartBasket.id.asc())
        .all()
    )
    s = norm_basket_scan(basket_scan)
    if not s:
        return None
    # Pass 1: exact physical barcode / scan_code (production: brck1-B02)
    for b in all_b:
        if b.barcode and norm_basket_scan(str(b.barcode)) == s:
            return b
        if getattr(b, "scan_code", None) and norm_basket_scan(str(b.scan_code)) == s:
            return b
    # Pass 2: primary label / name (S-1-2), not 0-based aliases
    for b in all_b:
        if b.name and norm_basket_scan(str(b.name)) == s:
            return b
        if norm_basket_scan(primary_basket_label(b)) == s:
            return b
    # Pass 3: remaining aliases (Koszyk r/c, B{id}, 0-based S)
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



def _quantity_mode_basket_put(
    db: Session,
    *,
    sess: WmsOperationSession,
    cart: Cart,
    basket_scan: str,
    uid: int | None,
    oid_scope: list[int],
    product_id: int,
    location_id: int | None,
    quantity: float | None,
    record_pick_fn,
    manual: bool,
) -> BasketPutResult:
    """
    DEFAULT QUANTITY MODE:
      basket scan → resolve allocation (ZERO Pick)
      quantity confirm → revalidate remaining → Pick +qty
    """
    scanned = _find_scanned_basket(db, cart=cart, basket_scan=basket_scan)
    if scanned is None:
        _raise_unknown_basket(
            db,
            cart=cart,
            basket_scan=basket_scan,
            sess=sess,
            uid=uid,
            product_id=product_id,
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
    allocation, err = resolve_allocation_for_basket_scan(
        db,
        cart=cart,
        order_ids=list(oid_scope or []),
        product_id=int(product_id),
        basket=scanned,
    )
    if err == "BASKET_PRODUCT_MISMATCH" or allocation is None:
        from .resolve import mismatch_diagnostics_payload

        diag = mismatch_diagnostics_payload(
            db,
            cart=cart,
            order_ids=list(oid_scope or []),
            product_id=int(product_id),
            scanned=scanned,
        )
        labels = _eligible_labels(diag.get("eligible_baskets") or [])
        raise BasketPutError(
            ec.BASKET_PRODUCT_MISMATCH,
            (
                f"{ec.operator_message(ec.BASKET_PRODUCT_MISMATCH)} "
                f"Zeskanowano: {scanned_label}"
                + (f" ({scanned.barcode})" if getattr(scanned, "barcode", None) else "")
                + f". Oczekiwane: {labels}."
            ),
            http_status=409,
            extra={
                "phase": "BASKET_PRODUCT_MISMATCH",
                "scanned_basket": scanned_label,
                **diag,
            },
        )
    if err == "BASKET_PRODUCT_ALREADY_COMPLETE":
        raise BasketPutError(
            "BASKET_PRODUCT_ALREADY_COMPLETE",
            f"Koszyk {scanned_label} ma już komplet tego produktu.",
            http_status=409,
            extra={"phase": "BASKET_PRODUCT_ALREADY_COMPLETE", "scanned_basket": scanned_label},
        )

    assert allocation is not None

    # SOURCE location is independent of DESTINATION basket. Never invent locations[0].
    if location_id is None or int(location_id) <= 0:
        raise BasketPutError(
            ec.PICK_LOCATION_REQUIRED,
            ec.operator_message(ec.PICK_LOCATION_REQUIRED),
            http_status=409,
            extra={"phase": "PICK_LOCATION_REQUIRED"},
        )
    source_location_id = int(location_id)

    from .location_stock import effective_pickable_qty_at_location

    loc_avail = effective_pickable_qty_at_location(
        db,
        tenant_id=int(cart.tenant_id),
        warehouse_id=int(cart.warehouse_id),
        product_id=int(product_id),
        location_id=source_location_id,
        for_update=True,
    )
    line_cap = float(allocation.line_remaining)
    qty_cap = min(line_cap, float(loc_avail))

    alloc_payload = [
        {
            "basket_id": int(allocation.basket_id),
            "basket_label": allocation.basket_label,
            "order_id": int(allocation.order_id),
            "order_item_id": int(allocation.order_item_id),
            "line_remaining": float(allocation.line_remaining),
            "location_id": source_location_id,
            "location_available": round(float(loc_avail), 6),
            "quantity_max": round(float(qty_cap), 6),
        }
    ]

    # Preview only — operator must confirm quantity (ZERO Pick).
    if quantity is None:
        _audit(
            "BASKET_QUANTITY_REQUIRED",
            session_id=sess.id,
            operator=uid,
            product_id=product_id,
            basket=allocation.basket_label,
            order_id=allocation.order_id,
            line_remaining=allocation.line_remaining,
            location_id=source_location_id,
            location_available=loc_avail,
        )
        return BasketPutResult(
            phase="QUANTITY_REQUIRED",
            order_id=int(allocation.order_id),
            order_item_id=int(allocation.order_item_id),
            quantity_put=0.0,
            expected_basket_label=allocation.basket_label,
            scanned_basket=scanned_label,
            eligible_baskets=alloc_payload,
            message=(
                f"Koszyk {allocation.basket_label} — podaj ilość do odłożenia "
                f"(max {qty_cap:g} szt.; lokalizacja: dostępne {loc_avail:g})."
            ),
        )

    qty = float(quantity)
    if qty <= 1e-9:
        raise BasketPutError(
            ec.QUANTITY_INVALID,
            "Ilość musi być większa od zera.",
            http_status=409,
            extra={"phase": "QUANTITY_INVALID", "line_remaining": float(allocation.line_remaining)},
        )

    # Live revalidation at commit — never trust modal remaining alone.
    live_alloc, live_err = resolve_allocation_for_basket_scan(
        db,
        cart=cart,
        order_ids=list(oid_scope or []),
        product_id=int(product_id),
        basket=scanned,
    )
    if live_err or live_alloc is None:
        raise BasketPutError(
            live_err or ec.BASKET_PRODUCT_MISMATCH,
            "Alokacja koszyka zmieniła się — odśwież i spróbuj ponownie.",
            http_status=409,
            extra={"phase": live_err or "BASKET_PRODUCT_MISMATCH"},
        )
    if int(live_alloc.order_item_id) != int(allocation.order_item_id) or int(live_alloc.basket_id) != int(
        allocation.basket_id
    ):
        raise BasketPutError(
            ec.QUANTITY_STALE,
            (
                f"Pozostała ilość / alokacja zmieniła się. "
                f"Maksymalnie możesz odłożyć {live_alloc.line_remaining:g} szt."
            ),
            http_status=409,
            extra={
                "phase": "QUANTITY_STALE",
                "line_remaining": float(live_alloc.line_remaining),
                "eligible_baskets": [
                    {
                        "basket_id": int(live_alloc.basket_id),
                        "basket_label": live_alloc.basket_label,
                        "order_id": int(live_alloc.order_id),
                        "order_item_id": int(live_alloc.order_item_id),
                        "line_remaining": float(live_alloc.line_remaining),
                    }
                ],
            },
        )
    if qty > float(live_alloc.line_remaining) + 1e-9:
        raise BasketPutError(
            ec.QUANTITY_EXCEEDS_REMAINING,
            (
                f"Pozostała ilość zmieniła się. "
                f"Maksymalnie możesz odłożyć {live_alloc.line_remaining:g} szt."
            ),
            http_status=409,
            extra={
                "phase": "QUANTITY_EXCEEDS_REMAINING",
                "line_remaining": float(live_alloc.line_remaining),
                "requested": float(qty),
            },
        )

    # Re-read effective stock under session lock (pending picks may have changed).
    loc_avail_live = effective_pickable_qty_at_location(
        db,
        tenant_id=int(cart.tenant_id),
        warehouse_id=int(cart.warehouse_id),
        product_id=int(product_id),
        location_id=source_location_id,
        for_update=True,
    )
    if qty > float(loc_avail_live) + 1e-9:
        raise BasketPutError(
            ec.QUANTITY_EXCEEDS_LOCATION_STOCK,
            (
                f"W lokalizacji dostępne jest tylko {loc_avail_live:g} szt. "
                f"(stan magazynu minus nie sfinalizowane zbieranie). Żądano {qty:g}."
            ),
            http_status=409,
            extra={
                "phase": "QUANTITY_EXCEEDS_LOCATION_STOCK",
                "location_id": source_location_id,
                "location_available": float(loc_avail_live),
                "requested": float(qty),
                "line_remaining": float(live_alloc.line_remaining),
            },
        )

    put_qty = min(float(qty), float(live_alloc.line_remaining), float(loc_avail_live))
    try:
        oid, oiid = record_pick_fn(
            quantity=put_qty,
            scope_order_id=int(live_alloc.order_id),
            location_id=source_location_id,
        )
    except TypeError:
        # Older test doubles without location_id kwarg
        oid, oiid = record_pick_fn(
            quantity=put_qty,
            scope_order_id=int(live_alloc.order_id),
        )
    except ValueError as e:
        msg = str(e)
        code = ec.SOURCE_LOCATION_INVALID
        if "nie należy do trasy" in msg.lower():
            code = ec.SOURCE_LOCATION_NOT_ON_ROUTE
        elif "dostępne jest tylko" in msg.lower() or "stan magazynu" in msg.lower():
            code = ec.QUANTITY_EXCEEDS_LOCATION_STOCK
        raise BasketPutError(
            code,
            msg,
            http_status=409,
            extra={
                "phase": code,
                "source_location_id": source_location_id,
                "scanned_basket_id": int(scanned.id),
                "scanned_barcode": (str(scanned.barcode).strip() if scanned.barcode else None),
                "product_id": int(product_id),
                "order_id": int(live_alloc.order_id),
                "order_item_id": int(live_alloc.order_item_id),
            },
        ) from e
    # Quantity mode does not keep unit-scan pending / series state.
    put_state.set_pending(db, sess, None)
    put_state.set_active_series(db, sess, None)
    event_confirm = "MANUAL_BASKET_CONFIRMATION" if manual else "BASKET_QUANTITY_COMMITTED"
    _audit(
        event_confirm,
        session_id=sess.id,
        operator=uid,
        order_id=oid,
        product_id=product_id,
        scanned_basket=scanned_label,
        quantity=put_qty,
        order_item_id=live_alloc.order_item_id,
    )
    rem_after = max(0.0, float(live_alloc.line_remaining) - float(put_qty))
    return BasketPutResult(
        phase="PUT_CONFIRMED",
        order_id=int(oid),
        order_item_id=int(oiid),
        quantity_put=float(put_qty),
        expected_basket_label=live_alloc.basket_label,
        scanned_basket=scanned_label,
        eligible_baskets=[
            {
                "basket_id": int(live_alloc.basket_id),
                "basket_label": live_alloc.basket_label,
                "order_id": int(live_alloc.order_id),
                "order_item_id": int(live_alloc.order_item_id),
                "line_remaining": rem_after,
            }
        ],
        message=f"KOSZYK {live_alloc.basket_label} — odłożono {put_qty:g} szt.",
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
    product_id: int | None = None,
    location_id: int | None = None,
    quantity: float | None = None,
) -> BasketPutResult:
    """
    Basket scan outcomes:

    - pending exists → Pick + activate/keep series (consume pending)
    - series exists, no pending → retarget destination, Pick=0
    - product_id context (detail), no pending, no series → activate destination, Pick=0
    - no pending, no series, no product context → EXPECTED_PRODUCT_SCAN

    Pending means only: physical unit already scanned, not yet assigned to a basket.
    Product context (detail route) alone is enough to select an eligible basket.
    """
    sess = _lock_session_for_put(db, assert_cart_ready_for_quick_pick(db, cart))
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    pending = put_state.get_pending(sess)
    oid_scope = list(order_ids or [])
    ctx_product_id = int(product_id) if product_id is not None and int(product_id) > 0 else None
    ctx_location_id = int(location_id) if location_id is not None and int(location_id) > 0 else None

    # --- DEFAULT QUANTITY MODE (detail product context) ---
    # product_id from picking detail is authoritative. Clear foreign series/pending.
    # Basket scan without quantity → QUANTITY_REQUIRED (ZERO Pick).
    # Basket scan with quantity → live revalidate → Pick +qty.
    if ctx_product_id is not None:
        series_ctx = put_state.get_active_series(sess)
        if series_ctx is not None and int(series_ctx.get("product_id") or 0) != ctx_product_id:
            put_state.set_active_series(db, sess, None)
            _audit(
                "BASKET_SERIES_CLEARED",
                session_id=sess.id,
                reason="foreign_series_cleared_for_product_context",
                previous_product_id=series_ctx.get("product_id"),
                context_product_id=ctx_product_id,
            )
        if pending is not None and int(pending.get("product_id") or 0) != ctx_product_id:
            put_state.set_pending(db, sess, None)
            pending = None
        elif pending is not None:
            # Quantity mode supersedes unit-pending (+1) semantics.
            put_state.set_pending(db, sess, None)
            pending = None
        return _quantity_mode_basket_put(
            db,
            sess=sess,
            cart=cart,
            basket_scan=basket_scan,
            uid=uid,
            oid_scope=oid_scope,
            product_id=ctx_product_id,
            location_id=ctx_location_id,
            quantity=quantity,
            record_pick_fn=record_pick_fn,
            manual=manual,
        )

    # --- Legacy: no product context — pending confirm / series switch ---
    if pending is None:
        series = put_state.get_active_series(sess)
        if series is None:
            if ctx_product_id is None:
                raise BasketPutError(
                    ec.EXPECTED_PRODUCT_SCAN,
                    ec.operator_message(ec.EXPECTED_PRODUCT_SCAN),
                    http_status=409,
                    extra={"phase": "EXPECTED_PRODUCT_SCAN"},
                )
            if ctx_location_id is None:
                raise BasketPutError(
                    ec.UNKNOWN_SCAN_CODE,
                    "Brak lokalizacji produktu — nie można aktywować koszyka docelowego.",
                    http_status=409,
                    extra={"phase": "NO_LOCATION_FOR_SERIES"},
                )
            return _activate_or_switch_series_destination(
                db,
                sess=sess,
                cart=cart,
                basket_scan=basket_scan,
                uid=uid,
                oid_scope=oid_scope,
                bind_product_id=ctx_product_id,
                bind_location_id=ctx_location_id,
                previous_series=None,
                phase="SERIES_ACTIVATED",
            )

        ser_uid = int(series.get("operator_user_id") or 0)
        if uid is not None and ser_uid and ser_uid != uid:
            raise BasketPutError(
                "BASKET_PUT_OWNED_BY_OTHER",
                "Aktywna seria należy do innego operatora.",
                http_status=409,
            )
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
            if ctx_product_id is not None and ctx_location_id is not None:
                return _activate_or_switch_series_destination(
                    db,
                    sess=sess,
                    cart=cart,
                    basket_scan=basket_scan,
                    uid=uid,
                    oid_scope=oid_scope,
                    bind_product_id=ctx_product_id,
                    bind_location_id=ctx_location_id,
                    previous_series=None,
                    phase="SERIES_ACTIVATED",
                )
            raise BasketPutError(
                ec.EXPECTED_PRODUCT_SCAN,
                "Seria odkładania wygasła — wybierz produkt / zeskanuj EAN, potem koszyk.",
                http_status=409,
                extra={"phase": "SERIES_STALE_CLEARED"},
            )
        if not oid_scope and series.get("order_id"):
            oid_scope = [int(series["order_id"])]
        return _activate_or_switch_series_destination(
            db,
            sess=sess,
            cart=cart,
            basket_scan=basket_scan,
            uid=uid,
            oid_scope=oid_scope,
            bind_product_id=int(series["product_id"]),
            bind_location_id=int(series["location_id"]),
            previous_series=series,
            phase="SERIES_DESTINATION_SWITCHED",
            operator_user_id_override=uid if uid is not None else series.get("operator_user_id"),
        )

    pend_uid = int(pending.get("operator_user_id") or 0)
    if uid is not None and pend_uid and pend_uid != uid:
        raise BasketPutError(
            "BASKET_PUT_OWNED_BY_OTHER",
            "To oczekujące odłożenie należy do innego operatora.",
            http_status=409,
        )

    pending_product_id = int(pending["product_id"])
    if ctx_product_id is not None and ctx_product_id != pending_product_id:
        raise BasketPutError(
            ec.FOREIGN_SKU_ON_SERIES,
            f"Oczekujące odłożenie dotyczy produktu {pending_product_id}, a kontekst ekranu to {ctx_product_id}.",
            http_status=409,
        )
    scanned = _find_scanned_basket(db, cart=cart, basket_scan=basket_scan)
    if scanned is None:
        _raise_unknown_basket(
            db,
            cart=cart,
            basket_scan=basket_scan,
            sess=sess,
            uid=uid,
            product_id=pending_product_id,
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
    if not oid_scope:
        elig = pending.get("eligible_baskets") or []
        oid_scope = [int(r["order_id"]) for r in elig if isinstance(r, dict) and r.get("order_id")]

    allocation, err = resolve_allocation_for_basket_scan(
        db,
        cart=cart,
        order_ids=list(oid_scope or []),
        product_id=pending_product_id,
        basket=scanned,
    )
    if err == "BASKET_PRODUCT_MISMATCH" or (err is None and allocation is None):
        from .resolve import mismatch_diagnostics_payload

        diag = mismatch_diagnostics_payload(
            db,
            cart=cart,
            order_ids=list(oid_scope or []),
            product_id=int(pending_product_id),
            scanned=scanned,
        )
        labels = _eligible_labels(diag.get("eligible_baskets") or [])
        _audit(
            "BASKET_PRODUCT_MISMATCH",
            session_id=sess.id,
            operator=uid,
            scanned_basket=scanned_label,
            scanned_basket_id=int(scanned.id),
            product_id=pending_product_id,
            eligible_count=len(diag.get("eligible_baskets") or []),
            rejected_count=len(diag.get("rejected_allocations") or []),
        )
        raise BasketPutError(
            ec.BASKET_PRODUCT_MISMATCH,
            (
                f"{ec.operator_message(ec.BASKET_PRODUCT_MISMATCH)} "
                f"Zeskanowano: {scanned_label}"
                + (f" ({scanned.barcode})" if getattr(scanned, "barcode", None) else "")
                + f". Oczekiwane: {labels}."
            ),
            http_status=409,
            extra={
                "phase": "BASKET_PRODUCT_MISMATCH",
                "scanned_basket": scanned_label,
                "pending": pending,
                **diag,
            },
        )
    if err == "BASKET_PRODUCT_ALREADY_COMPLETE":
        eligible = pending.get("eligible_baskets") or []
        if oid_scope:
            live = eligible_baskets_payload(
                list_eligible_basket_allocations(
                    db, cart=cart, order_ids=list(oid_scope), product_id=pending_product_id
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
            product_id=pending_product_id,
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
    pending_loc = int(pending.get("location_id") or 0)
    try:
        oid, oiid = record_pick_fn(
            quantity=qty,
            scope_order_id=int(allocation.order_id),
            location_id=pending_loc if pending_loc > 0 else None,
        )
    except TypeError:
        oid, oiid = record_pick_fn(
            quantity=qty,
            scope_order_id=int(allocation.order_id),
        )
    except ValueError as e:
        msg = str(e)
        code = ec.SOURCE_LOCATION_INVALID
        if "nie należy do trasy" in msg.lower():
            code = ec.SOURCE_LOCATION_NOT_ON_ROUTE
        raise BasketPutError(
            code,
            msg,
            http_status=409,
            extra={
                "phase": code,
                "source_location_id": pending_loc or None,
                "scanned_basket_id": int(scanned.id),
                "product_id": int(pending_product_id),
            },
        ) from e
    event_confirm = "MANUAL_BASKET_CONFIRMATION" if manual else "BASKET_CONFIRMED"
    _audit(
        event_confirm,
        session_id=sess.id,
        operator=uid,
        order_id=oid,
        product_id=pending_product_id,
        scanned_basket=scanned_label,
        quantity=qty,
    )
    series = {
        "operator_user_id": uid,
        "product_id": int(pending_product_id),
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
    if series_out is None:
        rem_after = float(allocation.line_remaining) - float(qty)
        series_out = {**series, "line_remaining": max(0.0, rem_after)}
    _audit(
        "BASKET_SERIES_ACTIVATED",
        session_id=sess.id,
        operator=uid,
        basket=allocation.basket_label,
        product_id=pending_product_id,
        order_item_id=allocation.order_item_id,
    )
    _audit(
        "PUT_CONFIRMED",
        session_id=sess.id,
        operator=uid,
        order_id=oid,
        product_id=pending_product_id,
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


def _activate_or_switch_series_destination(
    db: Session,
    *,
    sess: WmsOperationSession,
    cart: Cart,
    basket_scan: str,
    uid: int | None,
    oid_scope: list[int],
    bind_product_id: int,
    bind_location_id: int,
    previous_series: dict[str, Any] | None,
    phase: Literal["SERIES_ACTIVATED", "SERIES_DESTINATION_SWITCHED"],
    operator_user_id_override: Any = None,
) -> BasketPutResult:
    """Bind / retarget active series to scanned basket. Never increments Pick."""
    scanned = _find_scanned_basket(db, cart=cart, basket_scan=basket_scan)
    if scanned is None:
        _raise_unknown_basket(
            db,
            cart=cart,
            basket_scan=basket_scan,
            sess=sess,
            uid=uid,
            product_id=bind_product_id,
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
    if previous_series is not None and int(scanned.id) == int(previous_series.get("basket_id") or 0):
        raise BasketPutError(
            ec.NO_PENDING_PUT,
            f"Seria już wskazuje koszyk {scanned_label}. Zeskanuj EAN produktu, aby odłożyć kolejną sztukę.",
            http_status=409,
            extra={"phase": "SERIES_ACTIVE", "active_series": previous_series},
        )

    allocation, err = resolve_allocation_for_basket_scan(
        db,
        cart=cart,
        order_ids=list(oid_scope or []),
        product_id=int(bind_product_id),
        basket=scanned,
    )
    if err == "BASKET_PRODUCT_MISMATCH" or allocation is None:
        raise BasketPutError(
            "BASKET_PRODUCT_MISMATCH",
            f"Koszyk {scanned_label} nie przyjmuje produktu "
            f"(product_id={bind_product_id}). "
            f"Zeskanuj właściwy koszyk dla tego SKU.",
            http_status=409,
            extra={
                "phase": "BASKET_PRODUCT_MISMATCH",
                "scanned_basket": scanned_label,
                "series_product_id": bind_product_id,
                "series_basket_label": (previous_series or {}).get("basket_label"),
            },
        )
    if err == "BASKET_PRODUCT_ALREADY_COMPLETE":
        raise BasketPutError(
            "BASKET_PRODUCT_ALREADY_COMPLETE",
            f"Koszyk {scanned_label} ma już komplet tego produktu.",
            http_status=409,
            extra={"phase": "BASKET_PRODUCT_ALREADY_COMPLETE", "scanned_basket": scanned_label},
        )

    op_uid = operator_user_id_override if operator_user_id_override is not None else uid
    new_series = {
        "operator_user_id": op_uid,
        "product_id": int(bind_product_id),
        "order_id": int(allocation.order_id),
        "order_item_id": int(allocation.order_item_id),
        "basket_id": int(allocation.basket_id),
        "basket_label": allocation.basket_label,
        "location_id": int(bind_location_id),
        "activated_at": put_state.utc_now_iso(),
    }
    put_state.set_active_series(db, sess, new_series)
    series_out = project_active_series_with_live_remaining(
        db,
        cart=cart,
        series=new_series,
        order_ids=list(oid_scope or []),
    ) or {**new_series, "line_remaining": float(allocation.line_remaining)}

    if phase == "SERIES_ACTIVATED":
        _audit(
            "BASKET_SERIES_ACTIVATED",
            session_id=sess.id,
            operator=uid,
            basket=allocation.basket_label,
            product_id=bind_product_id,
            order_item_id=allocation.order_item_id,
            quantity_put=0,
            via="product_context_basket",
        )
        message = (
            f"AKTYWNY KOSZYK: {allocation.basket_label}. "
            f"Zeskanuj EAN produktu, aby dodać sztukę."
        )
    else:
        _audit(
            "BASKET_SERIES_DESTINATION_SWITCHED",
            session_id=sess.id,
            operator=uid,
            previous_basket=(previous_series or {}).get("basket_label"),
            next_basket=allocation.basket_label,
            product_id=bind_product_id,
            quantity_put=0,
            line_remaining=series_out.get("line_remaining"),
        )
        message = (
            f"Zmieniono koszyk docelowy serii na {allocation.basket_label}. "
            f"Qty bez zmian — zeskanuj EAN, aby odłożyć kolejną sztukę."
        )

    return BasketPutResult(
        phase=phase,
        order_id=int(allocation.order_id),
        order_item_id=int(allocation.order_item_id),
        quantity_put=0.0,
        active_series=series_out,
        expected_basket_label=allocation.basket_label,
        scanned_basket=scanned_label,
        message=message,
    )
