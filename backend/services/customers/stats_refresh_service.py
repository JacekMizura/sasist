"""Rebuild materialized customer_sales_stats / customer_product_stats rows."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from sqlalchemy.orm import Session, joinedload

from ...models.customer_analytics import CustomerProductStats, CustomerSalesStats
from ...models.order import Order
from ...models.order_item import OrderItem, order_item_is_replaced_line
from .order_financials import line_financials, order_financials, order_line_quantity

STATS_TTL_MINUTES = 60


def stats_are_fresh(row: Optional[CustomerSalesStats], *, now: Optional[datetime] = None) -> bool:
    if row is None or row.computed_at is None:
        return False
    ref = now or datetime.utcnow()
    return (ref - row.computed_at) < timedelta(minutes=STATS_TTL_MINUTES)


def ensure_customer_stats_fresh(
    db: Session,
    *,
    customer_id: int,
    tenant_id: int,
    force: bool = False,
) -> CustomerSalesStats:
    existing = (
        db.query(CustomerSalesStats)
        .filter(
            CustomerSalesStats.customer_id == int(customer_id),
            CustomerSalesStats.tenant_id == int(tenant_id),
        )
        .first()
    )
    if not force and stats_are_fresh(existing):
        return existing  # type: ignore[return-value]

    rebuild_customer_stats(db, customer_id=int(customer_id), tenant_id=int(tenant_id))
    row = (
        db.query(CustomerSalesStats)
        .filter(
            CustomerSalesStats.customer_id == int(customer_id),
            CustomerSalesStats.tenant_id == int(tenant_id),
        )
        .first()
    )
    if row is None:
        row = CustomerSalesStats(
            customer_id=int(customer_id),
            tenant_id=int(tenant_id),
            computed_at=datetime.utcnow(),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _is_return_or_correction(order: Order) -> bool:
    origin = (getattr(order, "order_origin", None) or "").strip().upper()
    if origin == "COMPLAINT":
        return True
    if getattr(order, "complaint_id", None):
        return True
    return False


def rebuild_customer_stats(db: Session, *, customer_id: int, tenant_id: int) -> None:
    orders: List[Order] = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(
            Order.customer_id == int(customer_id),
            Order.tenant_id == int(tenant_id),
            Order.deleted_at.is_(None),
        )
        .order_by(Order.order_date.asc(), Order.id.asc())
        .all()
    )

    total_net = total_vat = total_gross = 0.0
    total_products_qty = 0
    returns_corrections = 0
    order_dates: List[datetime] = []

    product_agg: Dict[int, dict] = defaultdict(
        lambda: {
            "purchase_count": 0,
            "total_quantity": 0,
            "total_gross": 0.0,
            "last_purchased_at": None,
        }
    )
    product_orders_seen: Dict[int, set[int]] = defaultdict(set)

    for order in orders:
        odt = order.order_date or order.created_at
        if odt:
            order_dates.append(odt)
        if _is_return_or_correction(order):
            returns_corrections += 1

        on, ov, og = order_financials(order)
        total_net += on
        total_vat += ov
        total_gross += og

        for it in order.items or []:
            if order_item_is_replaced_line(it):
                continue
            qty = order_line_quantity(it)
            total_products_qty += qty
            pid = int(it.product_id or 0)
            if pid <= 0:
                continue
            _, _, lg = line_financials(it)
            bucket = product_agg[pid]
            bucket["total_quantity"] += qty
            bucket["total_gross"] += lg
            if odt and (bucket["last_purchased_at"] is None or odt > bucket["last_purchased_at"]):
                bucket["last_purchased_at"] = odt
            if order.id not in product_orders_seen[pid]:
                product_orders_seen[pid].add(int(order.id))
                bucket["purchase_count"] += 1

    order_count = len(orders)
    avg_basket = round(total_gross / order_count, 2) if order_count else 0.0
    last_order_at = max(order_dates) if order_dates else None

    avg_gap: Optional[float] = None
    if len(order_dates) >= 2:
        sorted_dates = sorted(order_dates)
        gaps = [
            (sorted_dates[i] - sorted_dates[i - 1]).total_seconds() / 86400.0
            for i in range(1, len(sorted_dates))
        ]
        avg_gap = round(sum(gaps) / len(gaps), 1) if gaps else None

    now = datetime.utcnow()
    sales_row = (
        db.query(CustomerSalesStats)
        .filter(
            CustomerSalesStats.customer_id == int(customer_id),
            CustomerSalesStats.tenant_id == int(tenant_id),
        )
        .first()
    )
    if sales_row is None:
        sales_row = CustomerSalesStats(customer_id=int(customer_id), tenant_id=int(tenant_id))
        db.add(sales_row)

    sales_row.order_count = order_count
    sales_row.total_net = round(total_net, 2)
    sales_row.total_vat = round(total_vat, 2)
    sales_row.total_gross = round(total_gross, 2)
    sales_row.total_products_qty = total_products_qty
    sales_row.avg_basket_gross = avg_basket
    sales_row.last_order_at = last_order_at
    sales_row.avg_days_between_orders = avg_gap
    sales_row.returns_corrections_count = returns_corrections
    sales_row.computed_at = now

    db.query(CustomerProductStats).filter(
        CustomerProductStats.customer_id == int(customer_id),
        CustomerProductStats.tenant_id == int(tenant_id),
    ).delete(synchronize_session=False)

    for pid, bucket in product_agg.items():
        db.add(
            CustomerProductStats(
                customer_id=int(customer_id),
                product_id=int(pid),
                tenant_id=int(tenant_id),
                purchase_count=int(bucket["purchase_count"]),
                total_quantity=int(bucket["total_quantity"]),
                total_gross=round(float(bucket["total_gross"]), 2),
                last_purchased_at=bucket["last_purchased_at"],
                computed_at=now,
            )
        )

    db.commit()
