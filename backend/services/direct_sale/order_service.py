"""Create normal Order from direct sale session — operational anchor."""

from __future__ import annotations

import json
import logging
from datetime import datetime

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from ...models.commerce_operational import DirectSaleSession, DirectSaleSessionLine
from ...models.order import Order
from ...models.order_item import OrderItem
from ...models.order_ui_status import OrderUiStatus
from ..barcode_generation import next_internal_order_number, next_order_barcode
from ..direct_sales_settings_service import resolve_direct_sales_settings
from ..order_default_new_panel_status import assign_direct_sale_completed_panel_status
from ..sale_document_financials import netto_line_to_gross_fields, product_vat_for_direct_sale
from .errors import DirectSaleError


def _resolve_panel_status_id(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    configured_id: int | None,
) -> int | None:
    if configured_id is None or int(configured_id) <= 0:
        return None
    row = (
        db.query(OrderUiStatus)
        .filter(
            OrderUiStatus.id == int(configured_id),
            OrderUiStatus.tenant_id == int(tenant_id),
            OrderUiStatus.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    return int(row.id) if row is not None else None


def load_order_for_session(
    db: Session,
    sess: DirectSaleSession,
) -> tuple[Order | None, dict[int, OrderItem]]:
    """Idempotent — return existing order + line map for this session."""
    from ...models.commerce_operational import Payment

    order_id = int(sess.order_id) if getattr(sess, "order_id", None) else None
    if not order_id:
        pay = (
            db.query(Payment)
            .filter(
                Payment.direct_sale_session_id == int(sess.id),
                Payment.tenant_id == int(sess.tenant_id),
            )
            .order_by(Payment.id.desc())
            .first()
        )
        if pay is not None and getattr(pay, "order_id", None):
            order_id = int(pay.order_id)
    if not order_id:
        return None, {}

    order = (
        db.query(Order)
        .filter(Order.id == int(order_id), Order.tenant_id == int(sess.tenant_id))
        .first()
    )
    if order is None:
        return None, {}

    items = (
        db.query(OrderItem)
        .filter(OrderItem.order_id == int(order.id), OrderItem.issue_session_id == int(sess.id))
        .all()
    )
    if not items:
        items = db.query(OrderItem).filter(OrderItem.order_id == int(order.id)).all()
    by_line: dict[int, OrderItem] = {}
    line_ids = {int(ln.id) for ln in (sess.lines or [])}
    for oi in items:
        if int(getattr(oi, "issue_session_id", 0) or 0) == int(sess.id):
            for ln in sess.lines or []:
                if int(ln.product_id) == int(oi.product_id):
                    by_line[int(ln.id)] = oi
                    break
        elif not by_line and line_ids:
            by_line[int(list(line_ids)[0])] = oi
    return order, by_line


def create_order_from_session(
    db: Session,
    sess: DirectSaleSession,
    *,
    lines: list[DirectSaleSessionLine] | None = None,
) -> tuple[Order, dict[int, OrderItem]]:
    existing, existing_items = load_order_for_session(db, sess)
    if existing is not None:
        return existing, existing_items

    active_lines = list(lines or sess.lines or [])
    if not active_lines:
        raise DirectSaleError("Sesja nie ma pozycji.", code="empty_session")

    tid = int(sess.tenant_id)
    wid = int(sess.warehouse_id)
    goods_gross_total = 0.0
    for ln in active_lines:
        qty = int(round(float(ln.quantity or 0)))
        if qty <= 0:
            continue
        unit_net = float(ln.unit_price) if ln.unit_price is not None else 0.0
        disc = float(ln.discount_amount or 0)
        vat_p = product_vat_for_direct_sale(db, int(ln.product_id))
        fin = netto_line_to_gross_fields(unit_net=unit_net, qty=qty, discount=disc, vat_percent=vat_p)
        goods_gross_total += float(fin["line_gross"])

    order = Order(
        tenant_id=tid,
        warehouse_id=wid,
        customer_id=int(sess.customer_id) if getattr(sess, "customer_id", None) else None,
        number=next_internal_order_number(db, tid, wid),
        barcode=next_order_barcode(db, tid),
        order_date=datetime.utcnow(),
        value=round(goods_gross_total, 2),
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

    panel_status_id: int | None = None
    try:
        settings = resolve_direct_sales_settings(db, tenant_id=tid, warehouse_id=wid)
        panel_status_id = _resolve_panel_status_id(
            db,
            tenant_id=tid,
            warehouse_id=wid,
            configured_id=settings.resolved.default_order_status_id,
        )
    except Exception:
        logger.warning(
            "[direct_sales.complete] settings_resolve_failed tenant_id=%s warehouse_id=%s",
            tid,
            wid,
            exc_info=True,
        )
    assign_direct_sale_completed_panel_status(
        db,
        order,
        configured_status_id=panel_status_id,
    )
    db.flush()

    items_by_line: dict[int, OrderItem] = {}
    for ln in sorted(active_lines, key=lambda x: int(x.sort_order or 0)):
        qty = int(round(float(ln.quantity or 0)))
        if qty <= 0:
            continue
        unit_net = float(ln.unit_price) if ln.unit_price is not None else 0.0
        disc = float(ln.discount_amount or 0)
        vat_p = product_vat_for_direct_sale(db, int(ln.product_id))
        fin = netto_line_to_gross_fields(unit_net=unit_net, qty=qty, discount=disc, vat_percent=vat_p)
        line_meta = {
            "line_gross_total": float(fin["line_gross"]),
            "price_input_mode": "NETTO",
        }
        oi = OrderItem(
            order_id=int(order.id),
            product_id=int(ln.product_id),
            quantity=qty,
            unit_price=float(fin["unit_price"]) if fin["unit_price"] else None,
            total_price=round(float(fin["total_price"]), 2),
            vat_percent=float(fin["vat_percent"]),
            metadata_json=json.dumps(line_meta, ensure_ascii=False),
            source_location_id=int(ln.source_location_id) if ln.source_location_id else None,
            issue_session_id=int(sess.id),
        )
        db.add(oi)
        db.flush()
        items_by_line[int(ln.id)] = oi

    if not items_by_line:
        raise DirectSaleError("Sesja nie ma pozycji z dodatnią ilością.", code="empty_session")
    return order, items_by_line
