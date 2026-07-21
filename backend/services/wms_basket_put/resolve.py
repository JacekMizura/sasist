"""Resolve basket put allocations without writing picks.

Product scan identifies the SKU; basket scan chooses order / order_item.
Never bind a single FIFO destination basket before the basket is scanned.

SSOT remaining (same as product-detail ``orders[].quantity_to_pick``):
  rem = OrderItem.quantity − sum_pick_events_for_line_cart − wms_picking_line_missing_qty

Eligibility is driven by ``rem > 0`` + basket on active cart — NOT by a stale
``wms_picking_line_status='picked'`` left after undo / partial flows.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session, joinedload

from ...models.cart import Cart
from ...models.cart_basket import CartBasket
from ...models.enums import CartType
from ...models.order import Order
from ...models.order_item import order_item_is_replaced_line
from ..bundle_order_item_ops import order_item_skip_bundle_commercial_header_for_ops
from ..fulfillment_event_service import sum_pick_events_for_line_cart
from ..picking_assignment_service import ensure_order_basket_for_wms_pick
from .basket_match import primary_basket_label


@dataclass(frozen=True)
class BasketPutAllocation:
    order_id: int
    order_item_id: int
    product_id: int
    basket_id: int
    basket_label: str
    line_remaining: float


def cart_is_baskets_mode(cart: Cart) -> bool:
    raw = cart.type.value if hasattr(cart.type, "value") else str(cart.type)
    upper = str(raw).split(".")[-1].upper()
    if upper in ("MULTI", "BASKETS"):
        return True
    try:
        if cart.type == CartType.MULTI:
            return True
    except Exception:
        pass
    return upper == "MULTI"


def _line_remaining(db: Session, *, oi, cart_id: int) -> float:
    need = float(oi.quantity)
    miss_ln = float(oi.wms_picking_line_missing_qty or 0)
    picked_sum = sum_pick_events_for_line_cart(db, int(oi.id), int(cart_id))
    return need - float(picked_sum or 0) - miss_ln


def _line_qty_breakdown(db: Session, *, oi, cart_id: int) -> dict[str, float]:
    need = float(oi.quantity or 0)
    miss = float(oi.wms_picking_line_missing_qty or 0)
    picked = float(sum_pick_events_for_line_cart(db, int(oi.id), int(cart_id)) or 0)
    rem = max(0.0, need - picked - miss)
    return {
        "required_qty": need,
        "picked_qty": picked,
        "missing_qty": miss,
        "unresolved_qty": rem,
        # Alias: in quantity-mode MULTI, basket confirm writes the Pick+event together.
        "basket_confirmed_qty": picked,
        "pending_basket_put_qty": 0.0,
    }


def _heal_stale_picked_status(oi, rem: float) -> None:
    """If events say rem>0, do not keep a stale ``picked`` flag that blocks put."""
    st = (getattr(oi, "wms_picking_line_status", None) or "").strip().lower()
    if rem > 1e-9 and st == "picked":
        oi.wms_picking_line_status = None


def _line_structurally_skippable(oi) -> bool:
    if order_item_is_replaced_line(oi):
        return True
    if order_item_skip_bundle_commercial_header_for_ops(oi):
        return True
    return False


def _orders_for_product(
    db: Session,
    *,
    cart: Cart,
    order_ids: list[int],
) -> list[Order]:
    if not order_ids:
        return []
    return (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.basket))
        .filter(Order.id.in_([int(x) for x in order_ids]))
        .order_by(Order.id.asc())
        .all()
    )


def explain_basket_allocation_candidates(
    db: Session,
    *,
    cart: Cart,
    order_ids: list[int],
    product_id: int,
) -> tuple[list[BasketPutAllocation], list[dict[str, Any]]]:
    """
    Same walk as ``list_eligible_basket_allocations``, but also returns rejected rows
    with Polish ``reason`` for API diagnostics (not operator toast).
    """
    cid = int(cart.id)
    out: list[BasketPutAllocation] = []
    rejected: list[dict[str, Any]] = []

    for o in _orders_for_product(db, cart=cart, order_ids=order_ids):
        oc = getattr(o, "cart_id", None)
        if oc is not None and int(oc) != cid:
            continue
        ensure_order_basket_for_wms_pick(db, cart, o)
        db.refresh(o)
        if oc is None and (getattr(o, "cart_id", None) is None or int(o.cart_id) != cid):
            bid_probe = getattr(o, "basket_id", None)
            if bid_probe is None:
                continue
            on_cart = (
                db.query(CartBasket.id)
                .filter(CartBasket.id == int(bid_probe), CartBasket.cart_id == cid)
                .first()
            )
            if on_cart is None:
                continue
        bid = getattr(o, "basket_id", None)
        if bid is None:
            for oi in sorted(o.items or [], key=lambda x: int(x.id)):
                if int(oi.product_id) != int(product_id):
                    continue
                if _line_structurally_skippable(oi):
                    continue
                disp = _line_qty_breakdown(db, oi=oi, cart_id=cid)
                if disp["unresolved_qty"] > 1e-9:
                    rejected.append(
                        {
                            "order_item_id": int(oi.id),
                            "order_id": int(o.id),
                            "basket_id": None,
                            "reason": "Zamówienie nie ma przypisanego koszyka na aktywnym wózku",
                            **disp,
                        }
                    )
            continue
        basket = (
            db.query(CartBasket)
            .filter(CartBasket.id == int(bid), CartBasket.cart_id == cid)
            .first()
        )
        if basket is None:
            for oi in sorted(o.items or [], key=lambda x: int(x.id)):
                if int(oi.product_id) != int(product_id):
                    continue
                if _line_structurally_skippable(oi):
                    continue
                disp = _line_qty_breakdown(db, oi=oi, cart_id=cid)
                if disp["unresolved_qty"] > 1e-9:
                    rejected.append(
                        {
                            "order_item_id": int(oi.id),
                            "order_id": int(o.id),
                            "basket_id": int(bid),
                            "reason": "Koszyk zamówienia nie należy do aktywnego wózka",
                            **disp,
                        }
                    )
            continue
        label = primary_basket_label(basket)
        for oi in sorted(o.items or [], key=lambda x: int(x.id)):
            if int(oi.product_id) != int(product_id):
                continue
            if _line_structurally_skippable(oi):
                continue
            disp = _line_qty_breakdown(db, oi=oi, cart_id=cid)
            rem = float(disp["unresolved_qty"])
            st = (getattr(oi, "wms_picking_line_status", None) or "").strip().lower()
            if rem <= 1e-9:
                rejected.append(
                    {
                        "order_item_id": int(oi.id),
                        "order_id": int(o.id),
                        "basket_id": int(basket.id),
                        "reason": (
                            "Linia zamknięta brakiem"
                            if st == "missing" or disp["missing_qty"] > 1e-9
                            else "Brak nierozliczonej ilości (wyzerowane zdarzeniami PICK)"
                        ),
                        "line_status": st or None,
                        **disp,
                    }
                )
                break
            # rem > 0 → eligible even if stale status was ``picked`` (heal).
            _heal_stale_picked_status(oi, rem)
            out.append(
                BasketPutAllocation(
                    order_id=int(o.id),
                    order_item_id=int(oi.id),
                    product_id=int(product_id),
                    basket_id=int(basket.id),
                    basket_label=label,
                    line_remaining=float(rem),
                )
            )
            break
    return out, rejected


def list_eligible_basket_allocations(
    db: Session,
    *,
    cart: Cart,
    order_ids: list[int],
    product_id: int,
) -> list[BasketPutAllocation]:
    """
    All open order lines for this product that have a basket on the active cart.

    Order of list is stable (Order.id, OrderItem.id) for display only —
    it does NOT imply forced put order.

    SSOT aligned with product detail ``orders[].quantity_to_pick`` + basket on cart.
    """
    rows, _rej = explain_basket_allocation_candidates(
        db, cart=cart, order_ids=order_ids, product_id=product_id
    )
    return rows


def resolve_next_basket_allocation(
    db: Session,
    *,
    cart: Cart,
    order_ids: list[int],
    product_id: int,
) -> BasketPutAllocation | None:
    """First eligible allocation (display / series-exhausted fallback). Not a forced destination."""
    rows = list_eligible_basket_allocations(
        db, cart=cart, order_ids=order_ids, product_id=product_id
    )
    return rows[0] if rows else None


def resolve_allocation_for_series(
    db: Session,
    *,
    cart: Cart,
    order_ids: list[int],
    product_id: int,
    order_item_id: int,
    basket_id: int,
) -> BasketPutAllocation | None:
    """Re-resolve remaining qty for an active series target."""
    for alloc in list_eligible_basket_allocations(
        db, cart=cart, order_ids=order_ids, product_id=product_id
    ):
        if int(alloc.order_item_id) == int(order_item_id) and int(alloc.basket_id) == int(basket_id):
            return alloc
    return None


def resolve_allocation_for_basket_scan(
    db: Session,
    *,
    cart: Cart,
    order_ids: list[int],
    product_id: int,
    basket: CartBasket,
) -> tuple[BasketPutAllocation | None, str | None]:
    """
    Authoritative: product_id + scanned basket → open order_item + live remaining.

    ONLY accepts allocations present in ``list_eligible_basket_allocations`` for this
    basket_id (same SSOT as detail ``eligible_basket_destinations``).

    No fallback via ``CartBasket.order_id`` / foreign ``Order.basket_id`` — that would
    accept puts that the read model does not show as eligible.
    """
    cid = int(cart.id)
    bid = int(basket.id)
    eligible = [
        a
        for a in list_eligible_basket_allocations(
            db, cart=cart, order_ids=order_ids, product_id=product_id
        )
        if int(a.basket_id) == bid
    ]
    if eligible:
        return eligible[0], None

    # Distinguish complete vs wrong basket for operator messaging.
    order: Order | None = None
    basket_oid = getattr(basket, "order_id", None)
    if basket_oid is not None:
        q = (
            db.query(Order)
            .options(joinedload(Order.items))
            .filter(Order.id == int(basket_oid))
        )
        if order_ids:
            q = q.filter(Order.id.in_([int(x) for x in order_ids]))
        order = q.first()
        if order is not None:
            oc = getattr(order, "cart_id", None)
            if oc is not None and int(oc) != cid:
                order = None
    if order is None:
        q = (
            db.query(Order)
            .options(joinedload(Order.items))
            .filter(Order.basket_id == bid, Order.cart_id == cid)
        )
        if order_ids:
            q = q.filter(Order.id.in_([int(x) for x in order_ids]))
        order = q.first()

    if order is None:
        return None, "BASKET_PRODUCT_MISMATCH"

    had_sku_line = False
    for oi in sorted(order.items or [], key=lambda x: int(x.id)):
        if int(oi.product_id) != int(product_id):
            continue
        if _line_structurally_skippable(oi):
            continue
        had_sku_line = True
        rem = _line_remaining(db, oi=oi, cart_id=cid)
        if rem <= 1e-9:
            return None, "BASKET_PRODUCT_ALREADY_COMPLETE"
        # rem>0 but not in eligible → data inconsistency (e.g. Order.basket off-cart)
        return None, "BASKET_PRODUCT_MISMATCH"

    if had_sku_line:
        return None, "BASKET_PRODUCT_ALREADY_COMPLETE"
    return None, "BASKET_PRODUCT_MISMATCH"


def eligible_baskets_payload(
    allocations: list[BasketPutAllocation],
    db: Session | None = None,
) -> list[dict]:
    """Compact list for pending metadata + UI (one row per basket/order)."""
    seen: set[int] = set()
    rows: list[dict] = []
    barcode_by_id: dict[int, str | None] = {}
    scan_by_id: dict[int, str | None] = {}
    if db is not None and allocations:
        ids = [int(a.basket_id) for a in allocations]
        for b in db.query(CartBasket).filter(CartBasket.id.in_(ids)).all():
            barcode_by_id[int(b.id)] = (str(b.barcode).strip() if b.barcode else None) or None
            sc = getattr(b, "scan_code", None)
            scan_by_id[int(b.id)] = (str(sc).strip() if sc else None) or None
    for a in allocations:
        if a.basket_id in seen:
            continue
        seen.add(a.basket_id)
        bid = int(a.basket_id)
        rows.append(
            {
                "basket_id": bid,
                "basket_label": a.basket_label,
                "barcode": barcode_by_id.get(bid),
                "scan_code": scan_by_id.get(bid),
                "order_id": int(a.order_id),
                "order_item_id": int(a.order_item_id),
                "line_remaining": float(a.line_remaining),
                "unresolved_qty": float(a.line_remaining),
                "eligibility_reason": "Nierozliczona ilość na koszyku aktywnego wózka",
            }
        )
    return rows


def mismatch_diagnostics_payload(
    db: Session,
    *,
    cart: Cart,
    order_ids: list[int],
    product_id: int,
    scanned: CartBasket,
) -> dict[str, Any]:
    """Full API/log diagnostics for BASKET_PRODUCT_MISMATCH (not shown raw in operator toast)."""
    live, rejected = explain_basket_allocation_candidates(
        db, cart=cart, order_ids=order_ids, product_id=product_id
    )
    eligible_rows = eligible_baskets_payload(live, db=db)
    # Enrich eligible with full qty breakdown
    enriched: list[dict[str, Any]] = []
    for row in eligible_rows:
        oiid = int(row["order_item_id"])
        from ...models.order_item import OrderItem

        oi = db.query(OrderItem).filter(OrderItem.id == oiid).first()
        disp = (
            _line_qty_breakdown(db, oi=oi, cart_id=int(cart.id))
            if oi is not None
            else {
                "required_qty": 0.0,
                "picked_qty": 0.0,
                "missing_qty": 0.0,
                "unresolved_qty": float(row.get("line_remaining") or 0),
                "basket_confirmed_qty": 0.0,
                "pending_basket_put_qty": 0.0,
            }
        )
        enriched.append({**row, **disp})
    return {
        "product_id": int(product_id),
        "cart_id": int(cart.id),
        "scanned_basket_id": int(scanned.id),
        "scanned_barcode": (str(scanned.barcode).strip() if scanned.barcode else None),
        "scanned_scan_code": (
            str(scanned.scan_code).strip() if getattr(scanned, "scan_code", None) else None
        ),
        "scanned_label": primary_basket_label(scanned),
        "eligible_baskets": enriched,
        "rejected_allocations": rejected,
    }
