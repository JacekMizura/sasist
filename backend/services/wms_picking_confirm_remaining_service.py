"""
Confirm remaining product qty across pick locations (\"Zatwierdź i wróć\").

SSOT for location priority: ``PickingRoutingService._load_inventory_by_warehouse_product``
(pick-type first, then location name, then id) — same greedy order as pick list.

Writes draft Picks via existing ``record_wms_quick_pick`` / ``record_cartless_quick_pick``.
Does NOT mutate global document stock; Inventory.quantity changes only at finalize.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session, joinedload

from ..models.cart import Cart
from ..models.order import Order
from ..models.order_item import OrderItem, order_item_is_replaced_line
from ..schemas.wms_picking_products import WmsPickingOrderTypeFilter
from .bundle_order_item_ops import order_item_skip_bundle_commercial_header_for_ops
from .picking_routing_service import PickingRoutingService
from .wms_basket_put.location_stock import effective_pickable_qty_at_location

logger = logging.getLogger(__name__)


class ConfirmRemainingError(Exception):
    def __init__(self, code: str, message: str, *, http_status: int = 409):
        super().__init__(message)
        self.code = str(code)
        self.message = str(message)
        self.http_status = int(http_status)


def _product_remaining_qty(
    db: Session,
    *,
    orders: list[Order],
    product_id: int,
    cart_id: int | None,
    picking_session_id: int | None,
) -> float:
    from .fulfillment_event_service import sum_pick_events_for_line_cart
    from .wms_cartless_picking.scope import sum_picks_for_order_item_cartless

    total = 0.0
    for o in orders:
        for oi in sorted(o.items or [], key=lambda x: int(x.id)):
            if int(oi.product_id) != int(product_id):
                continue
            if order_item_is_replaced_line(oi):
                continue
            if order_item_skip_bundle_commercial_header_for_ops(oi):
                continue
            st_oi = (getattr(oi, "wms_picking_line_status", None) or "").strip().lower()
            if st_oi in ("picked", "missing"):
                continue
            need = float(oi.quantity or 0)
            miss_ln = float(getattr(oi, "wms_picking_line_missing_qty", None) or 0)
            if cart_id is not None and int(cart_id) > 0:
                picked_sum = float(sum_pick_events_for_line_cart(db, int(oi.id), int(cart_id)) or 0)
            else:
                picked_sum = float(sum_picks_for_order_item_cartless(db, order_item_id=int(oi.id)) or 0)
            rem = need - picked_sum - miss_ln
            if rem > 1e-9:
                total += rem
    return round(total, 6)


def _ordered_location_ids(
    db: Session,
    *,
    warehouse_id: int,
    product_id: int,
) -> list[int]:
    """Existing picking location priority — do not invent a new order."""
    cache = PickingRoutingService(db)._load_inventory_by_warehouse_product(
        {(int(warehouse_id), int(product_id))}
    )
    rows = cache.get((int(warehouse_id), int(product_id)), []) or []
    return [int(lid) for lid, _qty, _name in rows]


def confirm_remaining_product_picks(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    order_type: WmsPickingOrderTypeFilter,
    product_id: int,
    cart_id: int | None = None,
    picking_session_id: int | None = None,
    recovery_order_id: int | None = None,
    operator_user_id: int | None = None,
) -> dict[str, Any]:
    """
    Atomically pick the full remaining quantity for ``product_id`` across locations.

    Returns summary; caller commits. On insufficiency raises ``ConfirmRemainingError``
    before / without leaving partial picks (caller must rollback).
    """
    from .wms_picking_product_list_service import (
        record_wms_quick_pick,
        resolve_wms_picking_order_ids,
        _order_type_filter,
    )

    tid = int(tenant_id)
    wid = int(warehouse_id)
    pid = int(product_id)
    cid = int(cart_id) if cart_id is not None and int(cart_id) > 0 else None
    sid = (
        int(picking_session_id)
        if picking_session_id is not None and int(picking_session_id) > 0
        else None
    )
    recovery = (
        int(recovery_order_id)
        if recovery_order_id is not None and int(recovery_order_id) > 0
        else None
    )

    if cid is None and sid is None:
        raise ConfirmRemainingError(
            "MISSING_SESSION",
            "Wymagany cart_id albo picking_session_id.",
            http_status=400,
        )
    if cid is not None and sid is not None:
        raise ConfirmRemainingError(
            "INVALID_SESSION",
            "Nie łącz cart_id z picking_session_id.",
            http_status=400,
        )

    ot = _order_type_filter(order_type)
    if recovery is not None:
        order_ids = [recovery]
    else:
        order_ids = resolve_wms_picking_order_ids(
            db,
            tenant_id=tid,
            warehouse_id=wid,
            source_status_id=int(source_status_id),
            order_type=ot,
            cart_id=cid,
            picking_session_id=sid,
            fixed_order_ids=None,
            recovery_mode=False,
        )
    if not order_ids:
        raise ConfirmRemainingError(
            "NO_ORDERS",
            "Brak zamówień w aktywnej sesji zbierania.",
        )

    orders = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id.in_(order_ids))
        .order_by(Order.id.asc())
        .all()
    )
    remaining = _product_remaining_qty(
        db,
        orders=orders,
        product_id=pid,
        cart_id=cid,
        picking_session_id=sid,
    )
    if remaining <= 1e-9:
        return {
            "ok": True,
            "product_id": pid,
            "quantity_requested": 0.0,
            "quantity_put": 0.0,
            "locations": [],
            "already_complete": True,
            "message": "Produkt jest już w pełni pobrany.",
        }

    loc_ids = _ordered_location_ids(db, warehouse_id=wid, product_id=pid)
    if not loc_ids:
        raise ConfirmRemainingError(
            "INSUFFICIENT_LOCATION_STOCK",
            f"Brak lokalizacji ze stanem dla produktu — wymagane jeszcze {remaining:g} szt.",
        )

    # Plan under Inventory locks (for_update) so concurrent puts serialize.
    plan: list[tuple[int, float]] = []
    need = float(remaining)
    for lid in loc_ids:
        if need <= 1e-9:
            break
        avail = effective_pickable_qty_at_location(
            db,
            tenant_id=tid,
            warehouse_id=wid,
            product_id=pid,
            location_id=int(lid),
            for_update=True,
        )
        take = round(min(need, avail), 6)
        if take <= 1e-9:
            continue
        plan.append((int(lid), take))
        need = round(need - take, 6)

    if need > 1e-6:
        have = round(float(remaining) - need, 6)
        raise ConfirmRemainingError(
            "INSUFFICIENT_LOCATION_STOCK",
            (
                f"Niewystarczający stan na lokalizacjach. "
                f"Wymagane jeszcze {remaining:g} szt., dostępne {have:g} szt. "
                f"Nie zejdziemy poniżej zera — uzupełnij stan lub zgłoś brak."
            ),
        )

    created: list[dict[str, Any]] = []
    put_total = 0.0

    for lid, qty in plan:
        # Re-validate live effective (another concurrent writer may have reserved stock).
        avail = effective_pickable_qty_at_location(
            db,
            tenant_id=tid,
            warehouse_id=wid,
            product_id=pid,
            location_id=int(lid),
            for_update=True,
        )
        if avail + 1e-9 < float(qty):
            raise ConfirmRemainingError(
                "INSUFFICIENT_LOCATION_STOCK",
                (
                    f"Konflikt równoczesnego pobrania: lokalizacja {lid} ma teraz "
                    f"tylko {avail:g} szt. (próbowano {qty:g}). Operacja anulowana."
                ),
            )
        if cid is not None:
            record_wms_quick_pick(
                db,
                tenant_id=tid,
                warehouse_id=wid,
                source_status_id=int(source_status_id),
                order_type=order_type,
                product_id=pid,
                location_id=int(lid),
                quantity=float(qty),
                cart_id=int(cid),
                fixed_order_id=recovery,
                operator_user_id=operator_user_id,
            )
        else:
            from .wms_cartless_picking.pick_service import record_cartless_quick_pick

            record_cartless_quick_pick(
                db,
                tenant_id=tid,
                warehouse_id=wid,
                source_status_id=int(source_status_id),
                order_type=order_type,
                product_id=pid,
                location_id=int(lid),
                quantity=float(qty),
                picking_session_id=int(sid),
                operator_user_id=operator_user_id,
            )
        created.append({"location_id": int(lid), "quantity": float(qty)})
        put_total = round(put_total + float(qty), 6)

    # MULTI: clear any pending basket-put context — remaining qty is fully recorded.
    if cid is not None:
        try:
            from .wms_basket_put import clear_basket_put_state

            cart = (
                db.query(Cart)
                .filter(
                    Cart.id == int(cid),
                    Cart.tenant_id == tid,
                    Cart.warehouse_id == wid,
                )
                .first()
            )
            if cart is not None:
                clear_basket_put_state(db, cart=cart, reason="confirm_remaining")
        except Exception:
            logger.exception("clear_basket_put_state after confirm_remaining failed cart_id=%s", cid)

    return {
        "ok": True,
        "product_id": pid,
        "quantity_requested": float(remaining),
        "quantity_put": float(put_total),
        "locations": created,
        "already_complete": False,
        "message": f"Zatwierdzono pobranie {put_total:g} szt. z {len(created)} lokalizacji.",
    }
