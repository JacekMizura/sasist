"""Product Profitability Center: revenue, margin, frozen capital, decision statuses."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.product import Product
from ..models.supplier_product import SupplierProduct
from .product_cost_service import get_products_current_costs


@dataclass
class ProfitabilityRange:
    since: datetime
    until: datetime
    days: int


def _range_from_inputs(
    *,
    range_days: Optional[int],
    date_from: Optional[datetime],
    date_to: Optional[datetime],
) -> ProfitabilityRange:
    if date_from is not None and date_to is not None and date_to >= date_from:
        days = max(1, int((date_to - date_from).total_seconds() // 86400) + 1)
        return ProfitabilityRange(since=date_from, until=date_to, days=days)
    days = range_days if range_days in (1, 7, 30, 90, 365) else 30
    now = datetime.utcnow()
    return ProfitabilityRange(since=now - timedelta(days=days), until=now, days=days)


def _order_ts_expr():
    return func.coalesce(Order.created_at, Order.order_date)


def _line_revenue_expr():
    return func.coalesce(
        OrderItem.total_price,
        OrderItem.quantity * func.coalesce(OrderItem.unit_price, 0.0),
        0.0,
    )


def _active_line_filter():
    cleaned = func.upper(func.trim(func.coalesce(OrderItem.oms_line_status, "")))
    return cleaned != "REPLACED"


def _product_ids_for_scope(
    db: Session,
    *,
    tenant_id: int,
    supplier_id: Optional[int],
    brand_id: Optional[int],
    category_id: Optional[int],
) -> List[int]:
    q = db.query(Product.id).filter(Product.tenant_id == int(tenant_id), Product.deleted_at.is_(None))
    if brand_id is not None:
        q = q.filter(Product.manufacturer_id == int(brand_id))
    if category_id is not None:
        # Category relation is not modeled yet.
        pass
    if supplier_id is not None:
        sid = int(supplier_id)
        q = q.filter(
            or_(
                Product.default_supplier_id == sid,
                Product.id.in_(
                    db.query(SupplierProduct.product_id).filter(
                        SupplierProduct.tenant_id == int(tenant_id),
                        SupplierProduct.supplier_id == sid,
                    )
                ),
            )
        )
    return [int(r[0]) for r in q.all()]


def _sales_by_product(
    db: Session,
    *,
    tenant_id: int,
    product_ids: Iterable[int],
    rng: ProfitabilityRange,
    warehouse_id: Optional[int],
) -> Dict[int, Tuple[float, float]]:
    pids = [int(x) for x in set(product_ids)]
    if not pids:
        return {}
    q = (
        db.query(
            OrderItem.product_id,
            func.coalesce(func.sum(OrderItem.quantity), 0.0),
            func.coalesce(func.sum(_line_revenue_expr()), 0.0),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .filter(
            Order.tenant_id == int(tenant_id),
            Order.deleted_at.is_(None),
            OrderItem.product_id.in_(pids),
            _active_line_filter(),
            _order_ts_expr() >= rng.since,
            _order_ts_expr() <= rng.until,
        )
    )
    if warehouse_id is not None:
        q = q.filter(Order.warehouse_id == int(warehouse_id))
    rows = q.group_by(OrderItem.product_id).all()
    out: Dict[int, Tuple[float, float]] = {}
    for pid, qty, revenue in rows:
        if pid is None:
            continue
        out[int(pid)] = (float(qty or 0), float(revenue or 0))
    return out


def _inventory_stock_by_product(db: Session, *, tenant_id: int, product_ids: Iterable[int], warehouse_id: Optional[int]) -> Dict[int, float]:
    pids = [int(x) for x in set(product_ids)]
    if not pids:
        return {}
    from ..models.inventory import Inventory

    q = (
        db.query(Inventory.product_id, func.coalesce(func.sum(Inventory.quantity), 0.0))
        .filter(Inventory.tenant_id == int(tenant_id), Inventory.product_id.in_(pids))
    )
    if warehouse_id is not None:
        q = q.filter(Inventory.warehouse_id == int(warehouse_id))
    rows = q.group_by(Inventory.product_id).all()
    out: Dict[int, float] = defaultdict(float)
    for pid, qty in rows:
        if pid is None:
            continue
        out[int(pid)] = float(qty or 0)
    return out


def _status_for_row(*, margin_percent: Optional[float], sold_qty: float, stock_qty: float, days_cover: Optional[float]) -> str:
    if sold_qty <= 1e-9 and stock_qty > 1e-9:
        return "dead_stock"
    if margin_percent is None:
        return "unknown"
    if margin_percent < 0:
        return "loss"
    if margin_percent < 10:
        return "low_margin"
    if margin_percent >= 45 and sold_qty > 0:
        return "premium"
    if days_cover is not None and days_cover > 180 and stock_qty > 0:
        return "dead_stock"
    return "healthy"


def _recommendations(status: str) -> List[str]:
    if status == "loss":
        return ["Podnieś cenę o +3%", "Negocjuj cenę zakupu", "Sprzedawaj w zestawie"]
    if status == "low_margin":
        return ["Podnieś cenę o +3%", "Negocjuj cenę zakupu"]
    if status == "dead_stock":
        return ["Zmniejsz stan magazynowy", "Sprzedawaj w zestawie"]
    if status == "premium":
        return ["Uzupełnij stan", "Zwiększ promocję", "Pilnuj dostępności"]
    return ["Monitoruj", "Uzupełnij stan"]


def get_products_profitability(
    db: Session,
    *,
    tenant_id: int,
    range_days: Optional[int],
    page: int,
    page_size: int,
    warehouse_id: Optional[int] = None,
    brand_id: Optional[int] = None,
    supplier_id: Optional[int] = None,
    category_id: Optional[int] = None,
    only_loss: bool = False,
    only_low_margin: bool = False,
    only_no_sales: bool = False,
    only_top_profit: bool = False,
    only_high_stock: bool = False,
    sort: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> Dict[str, Any]:
    page = max(1, int(page))
    page_size = min(max(1, int(page_size)), 500)
    rng = _range_from_inputs(range_days=range_days, date_from=date_from, date_to=date_to)

    pids = _product_ids_for_scope(
        db,
        tenant_id=tenant_id,
        supplier_id=supplier_id,
        brand_id=brand_id,
        category_id=category_id,
    )
    if not pids:
        return {"rows": [], "summary": {}, "pagination": {"page": page, "page_size": page_size, "total": 0}}

    products = (
        db.query(Product)
        .filter(Product.tenant_id == int(tenant_id), Product.deleted_at.is_(None), Product.id.in_(pids))
        .all()
    )
    product_by_id = {int(p.id): p for p in products}
    sales = _sales_by_product(db, tenant_id=tenant_id, product_ids=pids, rng=rng, warehouse_id=warehouse_id)
    stocks = _inventory_stock_by_product(db, tenant_id=tenant_id, product_ids=pids, warehouse_id=warehouse_id)
    costs = get_products_current_costs(db, tenant_id, pids)

    rows: List[Dict[str, Any]] = []
    for pid in pids:
        p = product_by_id.get(int(pid))
        if p is None:
            continue
        sold_qty, revenue_net = sales.get(int(pid), (0.0, 0.0))
        cost = costs.get(int(pid), {})
        landed = float(cost.get("landed_cost_net") or 0.0)
        cost_of_goods = sold_qty * landed
        profit = revenue_net - cost_of_goods
        margin_percent = (profit / revenue_net * 100.0) if revenue_net > 1e-12 else None
        stock_qty = float(stocks.get(int(pid), 0.0))
        frozen = stock_qty * landed
        avg_daily = sold_qty / float(rng.days) if rng.days > 0 else 0.0
        days_cover = (stock_qty / avg_daily) if avg_daily > 1e-12 else None
        status = _status_for_row(margin_percent=margin_percent, sold_qty=sold_qty, stock_qty=stock_qty, days_cover=days_cover)

        row = {
            "product_id": int(pid),
            "image_url": (getattr(p, "image_url", None) or "").strip() or None,
            "sku": (getattr(p, "sku", None) or getattr(p, "symbol", None) or "").strip() or None,
            "ean": (getattr(p, "ean", None) or "").strip() or None,
            "product_name": (getattr(p, "name", None) or "").strip() or f"Product #{pid}",
            "stock_qty": round(stock_qty, 4),
            "sold_qty": round(sold_qty, 4),
            "revenue_net": round(revenue_net, 4),
            "cost_of_goods": round(cost_of_goods, 4),
            "profit_value": round(profit, 4),
            "margin_percent": round(margin_percent, 4) if margin_percent is not None else None,
            "sale_gross": cost.get("sale_gross"),
            "landed_cost_net": cost.get("landed_cost_net"),
            "purchase_price": cost.get("purchase_net"),
            "extra_cost_net": cost.get("extra_cost_net"),
            "frozen_capital": round(frozen, 4),
            "rotation": round(sold_qty / stock_qty, 4) if stock_qty > 1e-12 else None,
            "days_cover": round(days_cover, 2) if days_cover is not None else None,
            "status": status,
            "recommendations": _recommendations(status),
        }
        rows.append(row)

    if only_loss:
        rows = [r for r in rows if float(r.get("margin_percent") or 0) < 0]
    if only_low_margin:
        rows = [r for r in rows if 0 <= float(r.get("margin_percent") or 0) < 10]
    if only_no_sales:
        rows = [r for r in rows if float(r.get("sold_qty") or 0) <= 1e-9]
    if only_high_stock:
        rows = [r for r in rows if float(r.get("stock_qty") or 0) > 0]
    if only_top_profit:
        rows = sorted(rows, key=lambda r: float(r.get("profit_value") or 0), reverse=True)[:100]

    sort_key = (sort or "lowest_profit").strip().lower()
    sort_map = {
        "lowest_profit": (lambda r: float(r.get("profit_value") or 0), False),
        "highest_profit": (lambda r: float(r.get("profit_value") or 0), True),
        "highest_revenue": (lambda r: float(r.get("revenue_net") or 0), True),
        "highest_frozen_capital": (lambda r: float(r.get("frozen_capital") or 0), True),
        "worst_margin": (lambda r: float(r.get("margin_percent") or -9999), False),
        "best_margin": (lambda r: float(r.get("margin_percent") or -9999), True),
    }
    key_fn, rev = sort_map.get(sort_key, sort_map["lowest_profit"])
    rows.sort(key=key_fn, reverse=rev)

    total = len(rows)
    page_rows = rows[(page - 1) * page_size : (page - 1) * page_size + page_size]

    revenue_total = sum(float(r.get("revenue_net") or 0) for r in rows)
    profit_total = sum(float(r.get("profit_value") or 0) for r in rows)
    margins = [float(r["margin_percent"]) for r in rows if r.get("margin_percent") is not None]
    frozen_total = sum(float(r.get("frozen_capital") or 0) for r in rows)
    loss_count = sum(1 for r in rows if r.get("status") == "loss")
    low_margin_count = sum(1 for r in rows if r.get("status") == "low_margin")

    summary = {
        "revenue_net": round(revenue_total, 2),
        "profit_gross": round(profit_total, 2),
        "avg_margin_percent": round(sum(margins) / len(margins), 2) if margins else None,
        "loss_products": int(loss_count),
        "frozen_capital": round(frozen_total, 2),
        "low_margin_products": int(low_margin_count),
    }

    return {
        "rows": page_rows,
        "summary": summary,
        "pagination": {"page": page, "page_size": page_size, "total": total},
        "range": {"since": rng.since.isoformat(), "until": rng.until.isoformat(), "days": rng.days},
    }

