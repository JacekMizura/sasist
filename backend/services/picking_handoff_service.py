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


def packing_ui_mode_for_handoff(handoff: Optional[str], cart_id: Optional[int]) -> tuple[str, Optional[int]]:
    """Map handoff → legacy packing session mode labels (no_cart | bulk | baskets)."""
    m = normalize_handoff_mode(handoff)
    if m == HANDOFF_CARTLESS:
        return "no_cart", None
    if m == HANDOFF_BASKET:
        return "baskets", int(cart_id) if cart_id and int(cart_id) > 0 else None
    if m == HANDOFF_CART:
        return "bulk", int(cart_id) if cart_id and int(cart_id) > 0 else None
    return "no_cart", None


def reconcile_picking_handoff_modes(db: Session, *, tenant_id: int, warehouse_id: int) -> dict[str, int]:
    """
    Safe one-shot classify for packing-ready orders missing handoff.

    NEVER: cart_id IS NULL → CARTLESS.
    Safe: live cart_id + cart type → CART/BASKET.
    Cartless only when completed cartless session metadata unambiguously lists the order.
    """
    stats = {"cart": 0, "basket": 0, "cartless": 0, "skipped": 0}
    orders = (
        db.query(Order)
        .options(joinedload(Order.cart))
        .filter(
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            Order.deleted_at.is_(None),
            Order.fulfillment_state.in_(("READY_TO_PACK", "PACKING")),
        )
        .all()
    )
    cartless_ids = _deterministic_cartless_order_ids_from_sessions(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
    )
    for o in orders:
        if normalize_handoff_mode(getattr(o, "picking_handoff_mode", None)):
            stats["skipped"] += 1
            continue
        cid = getattr(o, "cart_id", None)
        if cid is not None and int(cid) > 0:
            mode = handoff_mode_for_cart_order(o, getattr(o, "cart", None))
            set_picking_handoff_mode(o, mode, overwrite=True)
            stats["cart" if mode == HANDOFF_CART else "basket"] += 1
            continue
        if int(o.id) in cartless_ids:
            set_picking_handoff_mode(o, HANDOFF_CARTLESS, overwrite=True)
            stats["cartless"] += 1
            continue
        stats["skipped"] += 1
    return stats


def _deterministic_cartless_order_ids_from_sessions(
    db: Session, *, tenant_id: int, warehouse_id: int
) -> set[int]:
    """
    Completed sessions with cart_id IS NULL and metadata cartless=true + assigned_order_ids.
    Only unambiguous cases.
    """
    out: set[int] = set()
    rows = (
        db.query(WmsOperationSession)
        .filter(
            WmsOperationSession.tenant_id == int(tenant_id),
            WmsOperationSession.warehouse_id == int(warehouse_id),
            WmsOperationSession.cart_id.is_(None),
            WmsOperationSession.completed_at.isnot(None),
        )
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
                out.add(int(x))
            except (TypeError, ValueError):
                continue
    return out
