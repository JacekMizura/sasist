"""Cartless quick-pick — Pick.cart_id=NULL, scope = picking_session_id."""

from __future__ import annotations

import logging

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ...models.order import Order
from ...models.order_item import OrderItem, order_item_is_replaced_line
from ...models.pick import Pick
from ...schemas.wms_picking_products import WmsPickingOrderTypeFilter
from ..bundle_order_item_ops import order_item_skip_bundle_commercial_header_for_ops
from ..fulfillment_event_service import record_pick_event_for_wms_pick
from ..order_fulfillment_state import touch_picking_in_progress
from ..wms_audit_service import emit_wms_picked_item, emit_wms_picking_started
from ..wms_picking_product_list_service import (
    _allowed_pick_location_ids_for_product,
    _order_type_filter,
    resolve_wms_picking_order_ids,
)
from .scope import get_cartless_session_or_raise, sum_picks_for_order_item_cartless

logger = logging.getLogger(__name__)


def record_cartless_quick_pick(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    order_type: WmsPickingOrderTypeFilter,
    product_id: int,
    location_id: int,
    quantity: float,
    picking_session_id: int,
    operator_user_id: int | None = None,
    product_scan_confirmed: bool = False,
    location_scan_confirmed: bool = False,
) -> tuple[int, int]:
    """
    Draft Pick z cart_id=NULL w ramach sesji cartless.
    Nie claimuje WarehouseCart; nie ustawia order.cart_id.
    """
    if quantity <= 0:
        raise ValueError("Ilość musi być > 0.")

    from ..wms_picking_terminal_settings_service import (
        get_or_create_wms_picking_terminal_settings,
        product_has_scannable_code,
        resolve_gates_from_terminal_row,
        assert_pick_terminal_gates,
    )
    from ..wms_basket_put.error_codes import (
        NO_ALLOWED_PICK_LOCATION_STOCK,
        QUANTITY_EXCEEDS_LOCATION_STOCK,
        RESERVE_LOCATION_FORBIDDEN,
        WRONG_LOCATION_SCAN,
        operator_message,
    )
    from ..wms_basket_put.location_stock import effective_pickable_qty_at_location
    from ..wms_basket_put.scan_service import BasketPutError
    from ...models.product import Product

    terminal = get_or_create_wms_picking_terminal_settings(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
    )
    product_row = (
        db.query(Product)
        .filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id))
        .first()
    )

    sess = get_cartless_session_or_raise(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        session_id=int(picking_session_id),
        operator_user_id=int(operator_user_id) if operator_user_id else None,
        require_open=True,
    )
    _ = sess

    ot = _order_type_filter(order_type)
    order_ids = resolve_wms_picking_order_ids(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        source_status_id=source_status_id,
        order_type=ot,
        picking_session_id=int(picking_session_id),
    )
    if not order_ids:
        raise ValueError("Brak zamówień w tej sesji zbierania.")

    allow_reserve = bool(terminal.allow_reserve_location_picking)
    allowed = _allowed_pick_location_ids_for_product(
        db,
        tenant_id=tenant_id,
        order_ids=order_ids,
        product_id=product_id,
        allow_reserve_location_picking=allow_reserve,
        warehouse_id=warehouse_id,
    )
    if not allowed:
        if not allow_reserve:
            all_locs = _allowed_pick_location_ids_for_product(
                db,
                tenant_id=tenant_id,
                order_ids=order_ids,
                product_id=product_id,
                allow_reserve_location_picking=True,
                warehouse_id=warehouse_id,
            )
            if all_locs:
                raise BasketPutError(
                    NO_ALLOWED_PICK_LOCATION_STOCK,
                    operator_message(NO_ALLOWED_PICK_LOCATION_STOCK),
                )
        raise ValueError("Brak lokalizacji do pobrania tego produktu (routing / alokacja).")

    gates = resolve_gates_from_terminal_row(
        terminal,
        location_count=len(allowed),
        has_scannable_product_code=product_has_scannable_code(product_row),
    )
    assert_pick_terminal_gates(
        gates,
        product_scan_confirmed=bool(product_scan_confirmed),
        location_scan_confirmed=bool(location_scan_confirmed),
    )

    if int(location_id) not in allowed:
        if not allow_reserve:
            from ...models.location import Location
            from ...storage_types import NON_PICKABLE_STORAGE_TYPE_ALIASES

            loc = db.query(Location).filter(Location.id == int(location_id)).first()
            loc_type = str(getattr(loc, "type", None) or "").strip().lower() if loc else ""
            if loc_type in NON_PICKABLE_STORAGE_TYPE_ALIASES:
                raise BasketPutError(
                    RESERVE_LOCATION_FORBIDDEN,
                    operator_message(RESERVE_LOCATION_FORBIDDEN),
                )
        raise BasketPutError(WRONG_LOCATION_SCAN, operator_message(WRONG_LOCATION_SCAN))

    q_remain = float(quantity)
    orders = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id.in_(order_ids))
        .order_by(Order.id.asc())
        .all()
    )

    last_oid, last_oiid = 0, 0
    while q_remain > 1e-9:
        progressed = False
        for o in orders:
            if int(getattr(o, "picking_session_id", 0) or 0) != int(picking_session_id):
                continue
            if getattr(o, "cart_id", None) is not None:
                raise ValueError(
                    f"Zamówienie #{o.number or o.id} ma cart_id — to nie jest zbieranie cartless."
                )
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
                need = float(oi.quantity)
                miss_ln = float(oi.wms_picking_line_missing_qty or 0)
                picked_sum = sum_picks_for_order_item_cartless(db, order_item_id=int(oi.id))
                rem = need - float(picked_sum or 0) - miss_ln
                if rem <= 1e-9:
                    continue
                take = min(q_remain, rem)
                loc_avail = effective_pickable_qty_at_location(
                    db,
                    tenant_id=int(tenant_id),
                    warehouse_id=int(warehouse_id),
                    product_id=int(product_id),
                    location_id=int(location_id),
                    for_update=True,
                    exclude_order_id=int(o.id),
                    account_foreign_reservations=True,
                )
                if float(take) > float(loc_avail) + 1e-9:
                    raise BasketPutError(
                        QUANTITY_EXCEEDS_LOCATION_STOCK,
                        operator_message(QUANTITY_EXCEEDS_LOCATION_STOCK),
                        extra={
                            "product_id": int(product_id),
                            "location_id": int(location_id),
                            "required_qty": float(take),
                            "available_qty": float(loc_avail),
                            "order_id": int(o.id),
                            "picking_session_id": int(picking_session_id),
                        },
                    )
                ps_before = getattr(o, "picking_started_at", None)
                touch_picking_in_progress(o)
                if getattr(o, "picking_session_id", None) is None:
                    raise ValueError("Brak picking_session_id na zamówieniu.")
                if ps_before is None and getattr(o, "picking_started_at", None) is not None:
                    emit_wms_picking_started(
                        db,
                        tenant_id=int(tenant_id),
                        warehouse_id=int(warehouse_id),
                        order=o,
                        cart=None,
                        operator_user_id=operator_user_id,
                    )
                pick = Pick(
                    tenant_id=int(tenant_id),
                    warehouse_id=int(warehouse_id),
                    order_id=int(o.id),
                    order_item_id=int(oi.id),
                    product_id=int(product_id),
                    location_id=int(location_id),
                    cart_id=None,
                    quantity=float(take),
                    picked_at=None,
                    status="picking",
                )
                if operator_user_id is not None and int(operator_user_id) > 0:
                    pick.picker_id = int(operator_user_id)
                db.add(pick)
                db.flush()
                record_pick_event_for_wms_pick(db, pick)
                pr = getattr(oi, "product", None)
                sku_hint = None
                if pr is not None:
                    sku_hint = (getattr(pr, "sku", None) or getattr(pr, "symbol", None) or None)
                    if sku_hint is not None:
                        sku_hint = str(sku_hint).strip() or None
                emit_wms_picked_item(
                    db,
                    tenant_id=int(tenant_id),
                    warehouse_id=int(warehouse_id),
                    order=o,
                    pick=pick,
                    cart=None,
                    product_sku=sku_hint,
                    product_id=int(product_id),
                    location_id=int(location_id),
                    operator_user_id=operator_user_id,
                )
                # cartless: refresh status via Pick sum (cart_id sentinel unused)
                _refresh_order_item_line_picked_status_cartless(db, oi)
                last_oid, last_oiid = int(o.id), int(oi.id)
                q_remain -= take
                progressed = True
                if q_remain <= 1e-9:
                    break
            if q_remain <= 1e-9:
                break
        if not progressed:
            break

    if last_oid <= 0:
        raise ValueError("Brak otwartej ilości do zebrania dla tego produktu w sesji.")
    return last_oid, last_oiid


def _refresh_order_item_line_picked_status_cartless(db: Session, oi: OrderItem) -> None:
    if order_item_is_replaced_line(oi):
        return
    st = (getattr(oi, "wms_picking_line_status", None) or "").strip().lower()
    if st == "missing":
        return
    need = float(oi.quantity or 0)
    if need <= 1e-9:
        return
    pq = sum_picks_for_order_item_cartless(db, order_item_id=int(oi.id))
    miss_ln = float(oi.wms_picking_line_missing_qty or 0)
    if miss_ln > 1e-9:
        return
    picked_eff = min(pq, max(0.0, need - miss_ln))
    if picked_eff + miss_ln + 1e-9 >= need:
        oi.wms_picking_line_status = "picked"
