"""Shared test helper: accept source_lock then confirm-basket-put (quantity mode)."""

from __future__ import annotations

from backend.services.wms_basket_put.scan_service import confirm_basket_put
from backend.services.wms_basket_put.source_lock import accept_source_location


def accept_and_confirm_basket_put(
    db,
    *,
    cart,
    sess,
    basket_scan: str,
    record_pick_fn,
    order_ids,
    product_id: int,
    location_id: int,
    quantity=None,
    operator_user_id: int | None = 1,
    manual: bool = False,
):
    accept_source_location(
        db,
        cart=cart,
        sess=sess,
        product_id=int(product_id),
        location_id=int(location_id),
        operator_user_id=operator_user_id,
    )
    return confirm_basket_put(
        db,
        cart=cart,
        basket_scan=basket_scan,
        operator_user_id=operator_user_id,
        record_pick_fn=record_pick_fn,
        order_ids=order_ids,
        product_id=int(product_id),
        location_id=int(location_id),
        quantity=quantity,
        manual=manual,
    )
