"""Reservation lifecycle — ACTIVE/EXPIRED/RELEASED/CONSUMED/CANCELLED."""

from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession
from ...models.stock_reservation import StockReservation
from ..direct_sale.constants import (
    RESERVATION_STATUS_ACTIVE,
    RESERVATION_STATUS_CANCELLED,
    RESERVATION_STATUS_CONSUMED,
    RESERVATION_STATUS_EXPIRED,
    RESERVATION_STATUS_RELEASED,
    legacy_status_to_lifecycle,
    lifecycle_to_legacy_status,
)
from ..operational_observability import log_reservation_lifecycle
from ..operational_sales_events import emit_operational_sales_event
from ..warehouse_inventory_movement_service import (
    BUCKET_SELLABLE,
    MOVEMENT_UNRESERVATION,
    record_inventory_movement,
)

logger = logging.getLogger(__name__)


def reservation_lifecycle_state(res: StockReservation) -> str:
    return legacy_status_to_lifecycle(str(res.status or ""))


def expire_reservation(
    db: Session,
    res: StockReservation,
    *,
    performed_by_user_id: int | None = None,
) -> None:
    if reservation_lifecycle_state(res) != RESERVATION_STATUS_ACTIVE:
        return
    res.status = lifecycle_to_legacy_status(RESERVATION_STATUS_EXPIRED)
    record_inventory_movement(
        db,
        tenant_id=int(res.tenant_id),
        product_id=int(res.product_id),
        warehouse_id=int(getattr(res, "warehouse_id", 0) or 0) or _warehouse_for_reservation(db, res),
        movement_type=MOVEMENT_UNRESERVATION,
        quantity=float(res.quantity or 0),
        inventory_bucket=BUCKET_SELLABLE,
        operator_admin_id=performed_by_user_id,
        from_location_id=int(res.location_id),
        metadata={"reservation_id": int(res.id), "reason": "expired"},
    )
    emit_operational_sales_event(
        db,
        "reservation.expired",
        tenant_id=int(res.tenant_id),
        order_id=int(res.order_id) if res.order_id else None,
        session_id=int(res.direct_sale_session_id) if res.direct_sale_session_id else None,
        location_id=int(res.location_id),
        product_id=int(res.product_id),
        qty=float(res.quantity or 0),
        source="reservation_lifecycle",
        performed_by_user_id=performed_by_user_id,
        extra={"reservation_id": int(res.id)},
    )
    log_reservation_lifecycle(
        action="expired",
        reservation_id=int(res.id),
        tenant_id=int(res.tenant_id),
        order_id=int(res.order_id) if res.order_id else None,
        session_id=int(res.direct_sale_session_id) if res.direct_sale_session_id else None,
        product_id=int(res.product_id),
        qty=float(res.quantity or 0),
    )


def release_reservation(
    db: Session,
    res: StockReservation,
    *,
    reason: str = "released",
    performed_by_user_id: int | None = None,
) -> None:
    if reservation_lifecycle_state(res) not in (RESERVATION_STATUS_ACTIVE, RESERVATION_STATUS_EXPIRED):
        return
    res.status = lifecycle_to_legacy_status(RESERVATION_STATUS_RELEASED)
    if reason != "cancelled":
        record_inventory_movement(
            db,
            tenant_id=int(res.tenant_id),
            product_id=int(res.product_id),
            warehouse_id=_warehouse_for_reservation(db, res),
            movement_type=MOVEMENT_UNRESERVATION,
            quantity=float(res.quantity or 0),
            inventory_bucket=BUCKET_SELLABLE,
            operator_admin_id=performed_by_user_id,
            from_location_id=int(res.location_id),
            metadata={"reservation_id": int(res.id), "reason": reason},
        )
    emit_operational_sales_event(
        db,
        "reservation.released",
        tenant_id=int(res.tenant_id),
        order_id=int(res.order_id) if res.order_id else None,
        session_id=int(res.direct_sale_session_id) if res.direct_sale_session_id else None,
        location_id=int(res.location_id),
        product_id=int(res.product_id),
        qty=float(res.quantity or 0),
        source="reservation_lifecycle",
        performed_by_user_id=performed_by_user_id,
        extra={"reservation_id": int(res.id), "reason": reason},
    )
    log_reservation_lifecycle(
        action="released",
        reservation_id=int(res.id),
        tenant_id=int(res.tenant_id),
        order_id=int(res.order_id) if res.order_id else None,
        session_id=int(res.direct_sale_session_id) if res.direct_sale_session_id else None,
        product_id=int(res.product_id),
        qty=float(res.quantity or 0),
        reason=reason,
    )


def mark_reservation_consumed(db: Session, res: StockReservation) -> None:
    res.status = lifecycle_to_legacy_status(RESERVATION_STATUS_CONSUMED)
    emit_operational_sales_event(
        db,
        "reservation.consumed",
        tenant_id=int(res.tenant_id),
        order_id=int(res.order_id) if res.order_id else None,
        session_id=int(res.direct_sale_session_id) if res.direct_sale_session_id else None,
        location_id=int(res.location_id),
        product_id=int(res.product_id),
        qty=float(res.quantity or 0),
        source="reservation_lifecycle",
        extra={"reservation_id": int(res.id)},
    )
    log_reservation_lifecycle(
        action="consumed",
        reservation_id=int(res.id),
        tenant_id=int(res.tenant_id),
        order_id=int(res.order_id) if res.order_id else None,
        session_id=int(res.direct_sale_session_id) if res.direct_sale_session_id else None,
        product_id=int(res.product_id),
        qty=float(res.quantity or 0),
    )


def release_session_reservations_lifecycle(
    db: Session,
    *,
    sess: DirectSaleSession,
    reason: str = "session_closed",
    performed_by_user_id: int | None = None,
) -> int:
    rows = (
        db.query(StockReservation)
        .filter(
            StockReservation.direct_sale_session_id == int(sess.id),
            StockReservation.status.in_(("reserved",)),
        )
        .all()
    )
    for r in rows:
        release_reservation(db, r, reason=reason, performed_by_user_id=performed_by_user_id)
    return len(rows)


def _warehouse_for_reservation(db: Session, res: StockReservation) -> int:
    if res.direct_sale_session_id:
        sess = db.query(DirectSaleSession).filter(DirectSaleSession.id == int(res.direct_sale_session_id)).first()
        if sess and sess.warehouse_id:
            return int(sess.warehouse_id)
    if res.order_id:
        from ...models.order import Order

        order = db.query(Order).filter(Order.id == int(res.order_id)).first()
        if order and order.warehouse_id:
            return int(order.warehouse_id)
    return 0
