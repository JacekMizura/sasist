"""
Immutable picking → packing handoff provenance.

``orders.picking_handoff_mode`` = snapshot of HOW the order was handed to packing
(CART | BASKET | CARTLESS). Independent of live ``cart_id`` / ``basket_id`` (custody)
and of current ``PickingConfig``.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from ..models.cart import Cart
from ..models.cart_basket import CartBasket
from ..models.enums import CartType
from ..models.order import Order
from ..models.wms_operation_session import WmsOperationSession

logger = logging.getLogger(__name__)

HANDOFF_CART = "CART"
HANDOFF_BASKET = "BASKET"
HANDOFF_CARTLESS = "CARTLESS"
HANDOFF_MODES = frozenset({HANDOFF_CART, HANDOFF_BASKET, HANDOFF_CARTLESS})


def normalize_handoff_mode(raw: object) -> Optional[str]:
    s = str(raw or "").strip().upper()
    return s if s in HANDOFF_MODES else None


def set_picking_handoff_mode(order: Order, mode: str, *, overwrite: bool = False) -> None:
    """
    Set immutable handoff mode. By default does not overwrite an existing value
    (config drift / re-finalize must not erase execution provenance).
    """
    m = normalize_handoff_mode(mode)
    if m is None:
        raise ValueError(f"invalid picking_handoff_mode: {mode!r}")
    cur = normalize_handoff_mode(getattr(order, "picking_handoff_mode", None))
    if cur is not None and not overwrite:
        return
    order.picking_handoff_mode = m


def handoff_mode_for_cart_order(order: Order, cart: Cart | None) -> str:
    """Derive handoff from actual cart execution (not PickingConfig)."""
    if getattr(order, "basket_id", None) is not None and int(order.basket_id) > 0:
        return HANDOFF_BASKET
    if cart is None:
        return HANDOFF_CART
    raw = cart.type.value if hasattr(cart.type, "value") else str(cart.type)
    t = raw.split(".")[-1].upper()
    if t in ("MULTI", "BASKETS"):
        return HANDOFF_BASKET
    return HANDOFF_CART


def apply_cart_picking_handoff(order: Order, cart: Cart | None) -> None:
    """Call when order becomes packing-bound after physical-cart finalize."""
    set_picking_handoff_mode(order, handoff_mode_for_cart_order(order, cart))


def apply_cartless_picking_handoff(order: Order) -> None:
    """Call when order completes true cartless picking finalize."""
    set_picking_handoff_mode(order, HANDOFF_CARTLESS)


def packing_ui_mode_for_handoff(
    handoff: Optional[str], cart_id: Optional[int]
) -> tuple[Optional[str], Optional[int]]:
    """
    Map handoff → packing session mode labels (no_cart | bulk | baskets).

    Unknown/NULL handoff → (None, None). Never treat bare NULL as CARTLESS.
    """
    m = normalize_handoff_mode(handoff)
    if m == HANDOFF_CARTLESS:
        return "no_cart", None
    if m == HANDOFF_BASKET:
        return "baskets", int(cart_id) if cart_id and int(cart_id) > 0 else None
    if m == HANDOFF_CART:
        return "bulk", int(cart_id) if cart_id and int(cart_id) > 0 else None
    return None, None


# Bound legacy session scan — not a full history walk on every GET /modes.
_CARTLESS_SESSION_SCAN_LIMIT = 200


def reconcile_picking_handoff_modes(db: Session, *, tenant_id: int, warehouse_id: int) -> dict[str, int]:
    """
    Bounded legacy classify for packing-ready orders with handoff IS NULL only.

    NEVER: cart_id IS NULL → CARTLESS.
    Safe: live cart_id + cart type → CART/BASKET.
    Cartless only when a recent completed cartless session unambiguously lists the order.
    """
    stats = {"cart": 0, "basket": 0, "cartless": 0, "skipped": 0, "candidates": 0}
    orders = (
        db.query(Order)
        .options(joinedload(Order.cart))
        .filter(
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            Order.deleted_at.is_(None),
            Order.fulfillment_state.in_(("READY_TO_PACK", "PACKING")),
            Order.picking_handoff_mode.is_(None),
        )
        .all()
    )
    stats["candidates"] = len(orders)
    if not orders:
        return stats

    need_cartless: set[int] = set()
    for o in orders:
        cid = getattr(o, "cart_id", None)
        if cid is not None and int(cid) > 0:
            mode = handoff_mode_for_cart_order(o, getattr(o, "cart", None))
            set_picking_handoff_mode(o, mode, overwrite=True)
            stats["cart" if mode == HANDOFF_CART else "basket"] += 1
        else:
            need_cartless.add(int(o.id))

    if need_cartless:
        cartless_ids = _deterministic_cartless_order_ids_from_sessions(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            candidate_order_ids=need_cartless,
        )
        for o in orders:
            oid = int(o.id)
            if oid not in need_cartless:
                continue
            if oid in cartless_ids:
                set_picking_handoff_mode(o, HANDOFF_CARTLESS, overwrite=True)
                stats["cartless"] += 1
            else:
                stats["skipped"] += 1
    return stats


def _deterministic_cartless_order_ids_from_sessions(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    candidate_order_ids: set[int] | None = None,
) -> set[int]:
    """
    Recent completed null-cart sessions with metadata cartless=true + assigned_order_ids.
    Intersects with candidate_order_ids when provided (no unbounded full-table meaning).
    """
    out: set[int] = set()
    wanted = set(candidate_order_ids) if candidate_order_ids is not None else None
    rows = (
        db.query(WmsOperationSession)
        .filter(
            WmsOperationSession.tenant_id == int(tenant_id),
            WmsOperationSession.warehouse_id == int(warehouse_id),
            WmsOperationSession.cart_id.is_(None),
            WmsOperationSession.completed_at.isnot(None),
            WmsOperationSession.metadata_json.isnot(None),
        )
        .order_by(WmsOperationSession.id.desc())
        .limit(_CARTLESS_SESSION_SCAN_LIMIT)
        .all()
    )
    for sess in rows:
        raw = getattr(sess, "metadata_json", None)
        if not raw or not str(raw).strip():
            continue
        try:
            meta = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            continue
        if not isinstance(meta, dict):
            continue
        if meta.get("cartless") is not True:
            continue
        ids = meta.get("assigned_order_ids") or meta.get("order_ids") or []
        if not isinstance(ids, (list, tuple)):
            continue
        for x in ids:
            try:
                oid = int(x)
            except (TypeError, ValueError):
                continue
            if wanted is not None and oid not in wanted:
                continue
            out.add(oid)
        if wanted is not None and wanted.issubset(out):
            break
    return out


def ensure_handoff_from_live_cart_custody(db: Session, order: Order) -> Optional[str]:
    """
    When packing-ready with NULL handoff but live cart custody — derive CART/BASKET.
    Never invents CARTLESS. Returns mode set or None.
    """
    if normalize_handoff_mode(getattr(order, "picking_handoff_mode", None)):
        return normalize_handoff_mode(getattr(order, "picking_handoff_mode", None))
    cid = getattr(order, "cart_id", None)
    if cid is None or int(cid) < 1:
        return None
    cart = getattr(order, "cart", None)
    if cart is None:
        cart = db.query(Cart).filter(Cart.id == int(cid)).first()
    apply_cart_picking_handoff(order, cart)
    return normalize_handoff_mode(getattr(order, "picking_handoff_mode", None))
