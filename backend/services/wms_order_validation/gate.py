"""Bramki Capacity / cart / sesja — ten sam SSOT walidacji."""

from __future__ import annotations

import logging
from typing import Optional, Sequence

from sqlalchemy.orm import Session

from ...models.order import Order
from ...models.pick import Pick
from .lifecycle import apply_wms_validation_fail
from .service import filter_orders_passing_wms_validation, validate_order_for_picking
from .types import WmsOrderValidationResult

logger = logging.getLogger(__name__)


def gate_orders_before_capacity(
    db: Session,
    *,
    orders: Sequence[Order],
    tenant_id: int,
    warehouse_id: int,
    operator_user_id: Optional[int] = None,
) -> list[Order]:
    """
    Przed Capacity / start_picking: FAIL → status + log (jeśli skonfigurowany), nie wraca do listy.
    Operator automatyczny: ``operator_user_id=None`` → Activity Log bez usera (System).
    """

    def _on_fail(order: Order, result: WmsOrderValidationResult) -> None:
        apply_wms_validation_fail(
            db,
            order=order,
            result=result,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            operator_user_id=operator_user_id,
        )

    return filter_orders_passing_wms_validation(
        db,
        orders=list(orders),
        tenant_id=int(tenant_id),
        on_fail=_on_fail,
    )


def order_has_session_picks(
    db: Session,
    *,
    order_id: int,
    cart_id: int,
    tenant_id: int,
    warehouse_id: int,
) -> bool:
    row = (
        db.query(Pick.id)
        .filter(
            Pick.tenant_id == int(tenant_id),
            Pick.warehouse_id == int(warehouse_id),
            Pick.order_id == int(order_id),
            Pick.cart_id == int(cart_id),
        )
        .first()
    )
    return row is not None


def defensive_revalidate_cart_orders_without_picks(
    db: Session,
    *,
    cart_id: int,
    tenant_id: int,
    warehouse_id: int,
    orders: Sequence[Order],
    operator_user_id: Optional[int] = None,
) -> list[dict]:
    """
    Race: PASS → cart → stock/lock zmiana → przed zbieraniem.

    Tylko zamówienia BEZ żadnego Pick na wózku: FAIL → detach + status.
    Zamówienia z pickami: NIE ruszaj (SHORTAGE / EMPTY_LOCATION).
    """
    from ...models.cart import Cart
    from ..cart_picking_lifecycle_service import can_detach_order_from_cart, detach_order_from_cart

    cart_row = (
        db.query(Cart)
        .filter(
            Cart.id == int(cart_id),
            Cart.tenant_id == int(tenant_id),
            Cart.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if cart_row is None:
        return []

    actions: list[dict] = []
    for order in orders:
        oid = int(order.id)
        if order_has_session_picks(
            db,
            order_id=oid,
            cart_id=int(cart_id),
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
        ):
            continue
        # Shortage zgłoszony w trakcie pickingu ≠ pre-pick Walidacja WMS — nie odłączaj.
        has_shortage = False
        for oi in order.items or []:
            if float(getattr(oi, "wms_picking_line_missing_qty", None) or 0.0) > 1e-9:
                has_shortage = True
                break
            if float(getattr(oi, "wms_shortage_declared_qty", None) or 0.0) > 1e-9:
                has_shortage = True
                break
        if has_shortage:
            continue
        result = validate_order_for_picking(
            db, order_id=oid, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
        )
        if result.ok or result.is_technical_error:
            continue
        apply_wms_validation_fail(
            db,
            order=order,
            result=result,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            operator_user_id=operator_user_id,
        )
        detached = False
        try:
            ok, _why = can_detach_order_from_cart(db, cart=cart_row, order=order)
            if ok:
                # Jedyna ścieżka: CartLifecycle (System = operator_user_id=None).
                detach_order_from_cart(
                    db,
                    cart_id=int(cart_id),
                    order_id=oid,
                    tenant_id=int(tenant_id),
                    warehouse_id=int(warehouse_id),
                    operator_user_id=operator_user_id,
                    reason="Automatyczne odłączenie po nieudanej Walidacji WMS (defensywna rewalidacja).",
                )
                detached = True
        except Exception:
            logger.exception(
                "[wms.validation] defensive detach failed order_id=%s cart_id=%s",
                oid,
                cart_id,
            )
        actions.append(
            {
                "order_id": oid,
                "detached": detached,
                "validation": result.to_dict(),
            }
        )
    return actions
