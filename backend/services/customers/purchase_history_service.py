"""Customer purchase history queries — summary, documents, top products, trend."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from ...models.app_user import AppUser
from ...models.customer import Customer
from ...models.customer_analytics import CustomerProductStats, CustomerSalesStats
from ...models.order import Order
from ...models.order_item import OrderItem, order_item_is_replaced_line
from ...models.product import Product
from ...schemas.commerce_enums import ORDER_CHANNEL_VALUES
from .order_financials import line_financials, order_financials, order_is_paid, order_line_quantity
from .purchase_history_labels import order_channel_label_pl
from .stats_refresh_service import ensure_customer_stats_fresh


@dataclass
class PurchaseHistoryFilters:
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    gross_min: Optional[float] = None
    gross_max: Optional[float] = None
    order_ui_status_id: Optional[int] = None
    warehouse_id: Optional[int] = None
    operator_user_id: Optional[int] = None
    order_channel: Optional[str] = None
    paid_only: bool = False
    completed_only: bool = False


def _parse_dt(raw: Optional[str], *, end_of_day: bool = False) -> Optional[datetime]:
    if not raw or not str(raw).strip():
        return None
    s = str(raw).strip()
    try:
        if len(s) <= 10:
            dt = datetime.fromisoformat(s)
            if end_of_day:
                return dt.replace(hour=23, minute=59, second=59, microsecond=999999)
            return dt.replace(hour=0, minute=0, second=0, microsecond=0)
        return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def filters_from_query(
    *,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    gross_min: Optional[float] = None,
    gross_max: Optional[float] = None,
    order_ui_status_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    operator_user_id: Optional[int] = None,
    order_channel: Optional[str] = None,
    paid_only: bool = False,
    completed_only: bool = False,
) -> PurchaseHistoryFilters:
    ch = (order_channel or "").strip().upper() or None
    if ch and ch not in ORDER_CHANNEL_VALUES:
        ch = None
    return PurchaseHistoryFilters(
        date_from=_parse_dt(date_from),
        date_to=_parse_dt(date_to, end_of_day=True),
        gross_min=gross_min,
        gross_max=gross_max,
        order_ui_status_id=int(order_ui_status_id) if order_ui_status_id else None,
        warehouse_id=int(warehouse_id) if warehouse_id else None,
        operator_user_id=int(operator_user_id) if operator_user_id else None,
        order_channel=ch,
        paid_only=bool(paid_only),
        completed_only=bool(completed_only),
    )


def _assert_customer(db: Session, *, customer_id: int, tenant_id: int) -> Customer:
    row = (
        db.query(Customer)
        .filter(
            Customer.id == int(customer_id),
            Customer.tenant_id == int(tenant_id),
            Customer.deleted_at.is_(None),
        )
        .first()
    )
    if row is None:
        raise LookupError("customer_not_found")
    return row


def _base_orders_query(db: Session, *, customer_id: int, tenant_id: int):
    return (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.order_ui_status),
            joinedload(Order.warehouse),
        )
        .filter(
            Order.customer_id == int(customer_id),
            Order.tenant_id == int(tenant_id),
            Order.deleted_at.is_(None),
        )
    )


def _order_operator_user_id(order: Order) -> Optional[int]:
    for it in order.items or []:
        uid = getattr(it, "issued_by_user_id", None)
        if uid:
            return int(uid)
    return None


def _order_matches_filters(order: Order, flt: PurchaseHistoryFilters) -> bool:
    odt = order.order_date or order.created_at
    if flt.date_from and odt and odt < flt.date_from:
        return False
    if flt.date_to and odt and odt > flt.date_to:
        return False
    if flt.order_ui_status_id and int(getattr(order, "order_ui_status_id", 0) or 0) != flt.order_ui_status_id:
        return False
    if flt.warehouse_id and int(order.warehouse_id or 0) != flt.warehouse_id:
        return False
    if flt.order_channel and (getattr(order, "order_channel", None) or "").strip().upper() != flt.order_channel:
        return False
    if flt.operator_user_id:
        op = _order_operator_user_id(order)
        if op != flt.operator_user_id:
            return False
    if flt.paid_only and not order_is_paid(order):
        return False
    if flt.completed_only:
        ous = order.order_ui_status
        mg = str(getattr(ous, "main_group", None) or "").strip().upper()
        if mg != "DONE":
            return False
    _, _, gross = order_financials(order)
    if flt.gross_min is not None and gross < flt.gross_min:
        return False
    if flt.gross_max is not None and gross > flt.gross_max:
        return False
    return True


def _document_number(order: Order) -> str:
    sdn = getattr(order, "sales_document_number", None)
    if sdn and str(sdn).strip():
        return str(sdn).strip()
    num = getattr(order, "number", None)
    if num and str(num).strip():
        return str(num).strip()
    return f"#{order.id}"


def _product_preview(it: OrderItem) -> dict[str, Any]:
    p = it.product
    return {
        "product_id": int(it.product_id) if it.product_id else None,
        "name": (p.name if p else None) or "—",
        "ean": (p.ean if p else None) or None,
        "sku": ((p.symbol or p.sku) if p else None) or None,
        "image_url": getattr(p, "image_url", None) if p else None,
        "quantity": order_line_quantity(it),
    }


def _status_badge(order: Order) -> dict[str, Any]:
    ous = order.order_ui_status
    if ous is None:
        st = (order.status or "NEW").strip()
        return {
            "id": None,
            "name": st,
            "color": "#64748b",
            "main_group": "NEW",
        }
    mg = str(getattr(ous, "main_group", None) or "NEW").strip().upper()
    return {
        "id": int(ous.id),
        "name": str(ous.name or "—"),
        "color": str(getattr(ous, "color", None) or "#64748b"),
        "main_group": mg if mg in ("NEW", "IN_PROGRESS", "DONE") else "NEW",
    }


def _operator_label(db: Session, order: Order) -> Optional[str]:
    uid = _order_operator_user_id(order)
    if not uid:
        return None
    user = db.query(AppUser).filter(AppUser.id == int(uid)).first()
    if user is None:
        return f"#{uid}"
    fn = (user.first_name or "").strip()
    ln = (user.last_name or "").strip()
    full = f"{fn} {ln}".strip()
    return full or user.login or f"#{uid}"


def build_filter_options(db: Session, *, customer_id: int, tenant_id: int) -> dict[str, Any]:
    orders = _base_orders_query(db, customer_id=customer_id, tenant_id=tenant_id).all()
    warehouse_ids: dict[int, str] = {}
    operator_ids: dict[int, str] = {}
    status_ids: dict[int, str] = {}

    for order in orders:
        wh = order.warehouse
        if wh and wh.id:
            warehouse_ids[int(wh.id)] = str(wh.name or f"Magazyn #{wh.id}")
        ous = order.order_ui_status
        if ous and ous.id:
            status_ids[int(ous.id)] = str(ous.name or f"#{ous.id}")
        uid = _order_operator_user_id(order)
        if uid:
            operator_ids[int(uid)] = _operator_label(db, order) or f"#{uid}"

    return {
        "warehouses": [{"id": k, "name": v} for k, v in sorted(warehouse_ids.items(), key=lambda x: x[1])],
        "operators": [{"id": k, "name": v} for k, v in sorted(operator_ids.items(), key=lambda x: x[1])],
        "statuses": [{"id": k, "name": v} for k, v in sorted(status_ids.items(), key=lambda x: x[1])],
        "channels": [{"id": ch, "name": order_channel_label_pl(ch)} for ch in ORDER_CHANNEL_VALUES],
    }


def build_summary(
    db: Session,
    *,
    customer_id: int,
    tenant_id: int,
    flt: PurchaseHistoryFilters,
) -> dict[str, Any]:
    _assert_customer(db, customer_id=customer_id, tenant_id=tenant_id)
    stats = ensure_customer_stats_fresh(db, customer_id=customer_id, tenant_id=tenant_id)

    if _filters_empty(flt):
        payload = _summary_from_stats(stats)
    else:
        orders = [
            o
            for o in _base_orders_query(db, customer_id=customer_id, tenant_id=tenant_id).all()
            if _order_matches_filters(o, flt)
        ]
        payload = _summary_from_orders(orders)

    payload["stats_computed_at"] = stats.computed_at.isoformat() if stats.computed_at else None
    payload["filter_options"] = build_filter_options(db, customer_id=customer_id, tenant_id=tenant_id)
    return payload


def _filters_empty(flt: PurchaseHistoryFilters) -> bool:
    return not any(
        [
            flt.date_from,
            flt.date_to,
            flt.gross_min is not None,
            flt.gross_max is not None,
            flt.order_ui_status_id,
            flt.warehouse_id,
            flt.operator_user_id,
            flt.order_channel,
            flt.paid_only,
            flt.completed_only,
        ]
    )


def _summary_from_stats(stats: CustomerSalesStats) -> dict[str, Any]:
    return {
        "total_gross": round(float(stats.total_gross or 0), 2),
        "total_net": round(float(stats.total_net or 0), 2),
        "total_vat": round(float(stats.total_vat or 0), 2),
        "order_count": int(stats.order_count or 0),
        "avg_basket_gross": round(float(stats.avg_basket_gross or 0), 2),
        "last_purchase_at": stats.last_order_at.isoformat() if stats.last_order_at else None,
        "total_products_qty": int(stats.total_products_qty or 0),
        "returns_corrections_count": int(stats.returns_corrections_count or 0),
        "avg_days_between_orders": stats.avg_days_between_orders,
    }


def _summary_from_orders(orders: List[Order]) -> dict[str, Any]:
    total_net = total_vat = total_gross = 0.0
    total_products_qty = 0
    returns_corrections = 0
    dates: List[datetime] = []

    for order in orders:
        on, ov, og = order_financials(order)
        total_net += on
        total_vat += ov
        total_gross += og
        odt = order.order_date or order.created_at
        if odt:
            dates.append(odt)
        if getattr(order, "complaint_id", None) or (getattr(order, "order_origin", None) or "").upper() == "COMPLAINT":
            returns_corrections += 1
        for it in order.items or []:
            total_products_qty += order_line_quantity(it)

    order_count = len(orders)
    avg_gap = None
    if len(dates) >= 2:
        sorted_dates = sorted(dates)
        gaps = [
            (sorted_dates[i] - sorted_dates[i - 1]).total_seconds() / 86400.0
            for i in range(1, len(sorted_dates))
        ]
        avg_gap = round(sum(gaps) / len(gaps), 1) if gaps else None

    return {
        "total_gross": round(total_gross, 2),
        "total_net": round(total_net, 2),
        "total_vat": round(total_vat, 2),
        "order_count": order_count,
        "avg_basket_gross": round(total_gross / order_count, 2) if order_count else 0.0,
        "last_purchase_at": max(dates).isoformat() if dates else None,
        "total_products_qty": total_products_qty,
        "returns_corrections_count": returns_corrections,
        "avg_days_between_orders": avg_gap,
    }


def build_purchase_history(
    db: Session,
    *,
    customer_id: int,
    tenant_id: int,
    flt: PurchaseHistoryFilters,
    page: int = 1,
    page_size: int = 25,
    sort_by: str = "date",
    sort_dir: str = "desc",
) -> dict[str, Any]:
    _assert_customer(db, customer_id=customer_id, tenant_id=tenant_id)
    ensure_customer_stats_fresh(db, customer_id=customer_id, tenant_id=tenant_id)

    orders = [
        o
        for o in _base_orders_query(db, customer_id=customer_id, tenant_id=tenant_id).all()
        if _order_matches_filters(o, flt)
    ]

    reverse = (sort_dir or "desc").lower() != "asc"

    def sort_key(order: Order):
        if sort_by == "document_number":
            return _document_number(order).lower()
        if sort_by == "net":
            return order_financials(order)[0]
        if sort_by == "gross":
            return order_financials(order)[2]
        if sort_by == "status":
            return _status_badge(order)["name"].lower()
        odt = order.order_date or order.created_at or datetime.min
        return odt

    orders.sort(key=sort_key, reverse=reverse)

    total = len(orders)
    page = max(1, int(page))
    page_size = max(1, min(100, int(page_size)))
    start = (page - 1) * page_size
    slice_rows = orders[start : start + page_size]

    items: List[dict[str, Any]] = []
    for idx, order in enumerate(slice_rows, start=start + 1):
        net, vat, gross = order_financials(order)
        previews = [
            _product_preview(it)
            for it in (order.items or [])
            if not order_item_is_replaced_line(it)
        ][:5]
        wh = order.warehouse
        odt = order.order_date or order.created_at
        items.append(
            {
                "lp": idx,
                "order_id": int(order.id),
                "document_number": _document_number(order),
                "order_date": odt.isoformat() if odt else None,
                "status": _status_badge(order),
                "products_preview": previews,
                "line_count": len([it for it in (order.items or []) if not order_item_is_replaced_line(it)]),
                "net": net,
                "vat": vat,
                "gross": gross,
                "warehouse_id": int(order.warehouse_id) if order.warehouse_id else None,
                "warehouse_name": (wh.name if wh else None) or None,
                "operator_name": _operator_label(db, order),
                "order_channel": order_channel_label_pl(getattr(order, "order_channel", None)),
                "is_paid": order_is_paid(order),
                "detail_path": f"/orders/{order.id}",
            }
        )

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


def build_top_products(
    db: Session,
    *,
    customer_id: int,
    tenant_id: int,
    flt: PurchaseHistoryFilters,
    limit: int = 10,
) -> dict[str, Any]:
    _assert_customer(db, customer_id=customer_id, tenant_id=tenant_id)

    if _filters_empty(flt):
        ensure_customer_stats_fresh(db, customer_id=customer_id, tenant_id=tenant_id)
        rows = (
            db.query(CustomerProductStats, Product)
            .join(Product, Product.id == CustomerProductStats.product_id)
            .filter(
                CustomerProductStats.customer_id == int(customer_id),
                CustomerProductStats.tenant_id == int(tenant_id),
            )
            .order_by(desc(CustomerProductStats.purchase_count), desc(CustomerProductStats.total_gross))
            .limit(max(1, min(50, int(limit))))
            .all()
        )
        items = [_top_product_row(stats, product) for stats, product in rows]
        return {"items": items}

    product_agg: Dict[int, dict] = defaultdict(
        lambda: {
            "purchase_count": 0,
            "total_quantity": 0,
            "total_gross": 0.0,
            "last_purchased_at": None,
            "product": None,
        }
    )
    seen: Dict[int, set[int]] = defaultdict(set)

    for order in _base_orders_query(db, customer_id=customer_id, tenant_id=tenant_id).all():
        if not _order_matches_filters(order, flt):
            continue
        odt = order.order_date or order.created_at
        for it in order.items or []:
            if order_item_is_replaced_line(it):
                continue
            pid = int(it.product_id or 0)
            if pid <= 0:
                continue
            bucket = product_agg[pid]
            bucket["product"] = it.product
            bucket["total_quantity"] += order_line_quantity(it)
            bucket["total_gross"] += line_financials(it)[2]
            if odt and (bucket["last_purchased_at"] is None or odt > bucket["last_purchased_at"]):
                bucket["last_purchased_at"] = odt
            if order.id not in seen[pid]:
                seen[pid].add(int(order.id))
                bucket["purchase_count"] += 1

    ranked = sorted(
        product_agg.values(),
        key=lambda b: (-int(b["purchase_count"]), -float(b["total_gross"])),
    )[: max(1, min(50, int(limit)))]

    items = []
    for bucket in ranked:
        product = bucket["product"]
        if product is None:
            continue
        items.append(
            {
                "product_id": int(product.id),
                "name": product.name or "—",
                "ean": product.ean,
                "sku": product.symbol or product.sku,
                "image_url": product.image_url,
                "purchase_count": int(bucket["purchase_count"]),
                "total_quantity": int(bucket["total_quantity"]),
                "total_gross": round(float(bucket["total_gross"]), 2),
                "last_purchased_at": bucket["last_purchased_at"].isoformat()
                if bucket["last_purchased_at"]
                else None,
                "detail_path": f"/products/{product.id}",
            }
        )
    return {"items": items}


def _top_product_row(stats: CustomerProductStats, product: Product) -> dict[str, Any]:
    return {
        "product_id": int(product.id),
        "name": product.name or "—",
        "ean": product.ean,
        "sku": product.symbol or product.sku,
        "image_url": product.image_url,
        "purchase_count": int(stats.purchase_count or 0),
        "total_quantity": int(stats.total_quantity or 0),
        "total_gross": round(float(stats.total_gross or 0), 2),
        "last_purchased_at": stats.last_purchased_at.isoformat() if stats.last_purchased_at else None,
        "detail_path": f"/products/{product.id}",
    }


def build_trend(
    db: Session,
    *,
    customer_id: int,
    tenant_id: int,
    flt: PurchaseHistoryFilters,
    granularity: str = "month",
) -> dict[str, Any]:
    _assert_customer(db, customer_id=customer_id, tenant_id=tenant_id)
    gran = (granularity or "month").strip().lower()
    if gran not in ("day", "week", "month"):
        gran = "month"

    buckets: Dict[str, float] = defaultdict(float)
    for order in _base_orders_query(db, customer_id=customer_id, tenant_id=tenant_id).all():
        if not _order_matches_filters(order, flt):
            continue
        odt = order.order_date or order.created_at
        if not odt:
            continue
        key = _bucket_key(odt, gran)
        _, _, gross = order_financials(order)
        buckets[key] += gross

    points = [{"period": k, "gross": round(v, 2)} for k, v in sorted(buckets.items())]
    return {"granularity": gran, "points": points}


def _bucket_key(dt: datetime, gran: str) -> str:
    if gran == "day":
        return dt.strftime("%Y-%m-%d")
    if gran == "week":
        iso = dt.isocalendar()
        return f"{iso.year}-W{iso.week:02d}"
    return dt.strftime("%Y-%m")
