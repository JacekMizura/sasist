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
from .errors import DirectSaleError
from .session_financials_service import compute_line_financials, compute_session_totals


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
    totals = compute_session_totals(db, sess)
    goods_gross_total = float(totals["total_gross"])

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

    from ..order_fulfillment_lifecycle_service import (
        apply_initial_fulfillment_assignment,
        on_order_shipped,
    )

    apply_initial_fulfillment_assignment(db, order)
    on_order_shipped(order)

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
        fin = compute_line_financials(db, ln)
        line_meta = {
            "line_gross_total": float(fin["line_gross"]),
            "line_discount_gross": float(fin["line_discount_gross"]),
            "price_input_mode": "NETTO",
        }
        unit_net = round(float(fin["line_net"]) / qty, 4) if qty > 0 else 0.0
        oi = OrderItem(
            order_id=int(order.id),
            product_id=int(ln.product_id),
            quantity=qty,
            unit_price=unit_net,
            total_price=round(float(fin["line_net"]), 2),
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

    order_disc_type = getattr(sess, "order_discount_type", None)
    order_disc_val = float(getattr(sess, "order_discount_value", None) or 0)
    if order_disc_type and order_disc_val > 1e-9:
        order.discount_type = str(order_disc_type)
        order.discount_value = order_disc_val
        meta = {}
        raw_meta = getattr(order, "import_metadata_json", None)
        if raw_meta:
            try:
                meta = json.loads(raw_meta) if isinstance(raw_meta, str) else {}
            except json.JSONDecodeError:
                meta = {}
        if not isinstance(meta, dict):
            meta = {}
        meta["order_discount_gross"] = float(totals.get("order_discount_gross") or 0)
        order.import_metadata_json = json.dumps(meta, ensure_ascii=False)

    return order, items_by_line
