"""Create normal Order from direct sale session — operational anchor."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession, DirectSaleSessionLine
from ...models.order import Order
from ...models.order_item import OrderItem
from ..barcode_generation import next_internal_order_number, next_order_barcode
from .errors import DirectSaleError


def create_order_from_session(
    db: Session,
    sess: DirectSaleSession,
    *,
    lines: list[DirectSaleSessionLine] | None = None,
) -> tuple[Order, dict[int, OrderItem]]:
    active_lines = list(lines or sess.lines or [])
    if not active_lines:
        raise DirectSaleError("Sesja nie ma pozycji.", code="empty_session")

    tid = int(sess.tenant_id)
    wid = int(sess.warehouse_id)
    goods_total = 0.0
    for ln in active_lines:
        qty = float(ln.quantity or 0)
        if qty <= 0:
            continue
        unit = float(ln.unit_price) if ln.unit_price is not None else 0.0
        disc = float(ln.discount_amount or 0)
        goods_total += max(0.0, unit * qty - disc)

    order = Order(
        tenant_id=tid,
        warehouse_id=wid,
        customer_id=int(sess.customer_id) if getattr(sess, "customer_id", None) else None,
        number=next_internal_order_number(db, tid, wid),
        barcode=next_order_barcode(db, tid),
        order_date=datetime.utcnow(),
        value=round(goods_total, 2),
        source="direct-sales",
        order_channel="DIRECT_SALE",
        fulfillment_mode="IMMEDIATE",
        status="COMPLETED",
        currency="PLN",
        created_at=datetime.utcnow(),
        packed_at=datetime.utcnow(),
    )
    db.add(order)
    db.flush()

    items_by_line: dict[int, OrderItem] = {}
    for ln in sorted(active_lines, key=lambda x: int(x.sort_order or 0)):
        qty = int(round(float(ln.quantity or 0)))
        if qty <= 0:
            continue
        unit = float(ln.unit_price) if ln.unit_price is not None else 0.0
        disc = float(ln.discount_amount or 0)
        total = max(0.0, unit * qty - disc)
        oi = OrderItem(
            order_id=int(order.id),
            product_id=int(ln.product_id),
            quantity=qty,
            unit_price=unit if unit else None,
            total_price=round(total, 2),
            source_location_id=int(ln.source_location_id) if ln.source_location_id else None,
            issue_session_id=int(sess.id),
        )
        db.add(oi)
        db.flush()
        items_by_line[int(ln.id)] = oi

    if not items_by_line:
        raise DirectSaleError("Sesja nie ma pozycji z dodatnią ilością.", code="empty_session")
    return order, items_by_line
