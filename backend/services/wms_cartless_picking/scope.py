"""Scope zamówień aktywnej sesji cartless — PRIMARY KEY = picking_session_id."""

from __future__ import annotations

from typing import Sequence

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ...models.order import Order
from ...models.pick import Pick
from ...models.wms_operation_session import WmsOperationSession
from ..cart_picking_lifecycle_service import SESSION_KIND_PICKING_ACTIVE


def find_open_cartless_picking_session(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    operator_user_id: int,
    session_id: int | None = None,
) -> WmsOperationSession | None:
    """
    Otwarta sesja cartless: cart_id IS NULL, kind=picking_active.
    Przy ``session_id`` — dokładne ID + ownership; bez — najnowsza sesja operatora.
    """
    q = (
        db.query(WmsOperationSession)
        .filter(
            WmsOperationSession.tenant_id == int(tenant_id),
            WmsOperationSession.warehouse_id == int(warehouse_id),
            WmsOperationSession.session_kind == SESSION_KIND_PICKING_ACTIVE,
            WmsOperationSession.cart_id.is_(None),
            WmsOperationSession.completed_at.is_(None),
            WmsOperationSession.operator_user_id == int(operator_user_id),
        )
    )
    if session_id is not None:
        q = q.filter(WmsOperationSession.id == int(session_id))
        return q.first()
    return q.order_by(WmsOperationSession.id.desc()).first()


def get_cartless_session_or_raise(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    session_id: int,
    operator_user_id: int | None = None,
    require_open: bool = True,
    allow_system: bool = False,
) -> WmsOperationSession:
    sess = (
        db.query(WmsOperationSession)
        .filter(
            WmsOperationSession.id == int(session_id),
            WmsOperationSession.tenant_id == int(tenant_id),
            WmsOperationSession.warehouse_id == int(warehouse_id),
            WmsOperationSession.cart_id.is_(None),
            WmsOperationSession.session_kind == SESSION_KIND_PICKING_ACTIVE,
        )
        .first()
    )
    if sess is None:
        raise ValueError("Nie znaleziono sesji zbierania (cartless).")
    if require_open and getattr(sess, "completed_at", None) is not None:
        raise ValueError("Sesja zbierania jest już zakończona.")
    if not allow_system and operator_user_id is not None:
        own = getattr(sess, "operator_user_id", None)
        if own is None or int(own) != int(operator_user_id):
            raise PermissionError("Sesja zbierania należy do innego operatora.")
    return sess


def list_order_ids_on_picking_session(
    db: Session,
    *,
    session_id: int,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
) -> list[int]:
    q = db.query(Order.id).filter(
        Order.picking_session_id == int(session_id),
        Order.deleted_at.is_(None),
    )
    if tenant_id is not None:
        q = q.filter(Order.tenant_id == int(tenant_id))
    if warehouse_id is not None:
        q = q.filter(Order.warehouse_id == int(warehouse_id))
    rows = q.order_by(Order.id.asc()).all()
    return [int(r[0]) for r in rows]


def sum_picks_for_order_item_cartless(db: Session, *, order_item_id: int) -> float:
    """Suma Pick (draft + done) z cart_id IS NULL dla linii — SSOT postępu cartless."""
    row = (
        db.query(func.coalesce(func.sum(Pick.quantity), 0.0))
        .filter(
            Pick.order_item_id == int(order_item_id),
            Pick.cart_id.is_(None),
            Pick.status.in_(("done", "picking", "waiting")),
        )
        .scalar()
    )
    return float(row or 0.0)


def picked_by_product_cartless(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_ids: Sequence[int],
) -> dict[int, float]:
    if not order_ids:
        return {}
    rows = (
        db.query(Pick.product_id, func.coalesce(func.sum(Pick.quantity), 0.0))
        .filter(
            Pick.tenant_id == int(tenant_id),
            Pick.warehouse_id == int(warehouse_id),
            Pick.order_id.in_([int(x) for x in order_ids]),
            Pick.cart_id.is_(None),
            Pick.status.in_(("done", "picking", "waiting")),
        )
        .group_by(Pick.product_id)
        .all()
    )
    return {int(pid): float(qty or 0) for pid, qty in rows}


def list_orders_on_picking_session(
    db: Session,
    *,
    session_id: int,
) -> list[Order]:
    return (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(
            Order.picking_session_id == int(session_id),
            Order.deleted_at.is_(None),
        )
        .order_by(Order.id.asc())
        .all()
    )


def assert_orders_unclaimed_for_assign(orders: Sequence[Order]) -> list[Order]:
    """Filtr: brak cart_id i brak aktywnego picking_session_id."""
    out: list[Order] = []
    for o in orders:
        if getattr(o, "cart_id", None) is not None:
            continue
        ps = getattr(o, "picking_session_id", None)
        if ps is not None and int(ps) > 0:
            continue
        out.append(o)
    return out
