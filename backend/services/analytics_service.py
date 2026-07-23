"""
Analytics service – order-based only.

Uses only: orders, order_items, products, inventory.
Does not depend on: picks, inventory_units, stock, inventory_movements.
All analytics work when picks=0, inventory_units=0.

Pick route, walking cost, and batch picking use the unified simulation engine
(backend/domain/simulation).
"""

import logging
from datetime import datetime, timedelta, date
from typing import Any

from sqlalchemy import func, and_, or_
from sqlalchemy.orm import Session, aliased, joinedload

from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.pick import Pick
from ..models.product import Product
from ..models.inventory import Inventory
from ..models.location import Location
from ..models.warehouse import Bin
from ..models.warehouse import Warehouse
from ..storage_types import NON_PICKABLE_STORAGE_TYPE_ALIASES, get_storage_priority
from ..domain.simulation import (
    simulate_single_order,
    simulate_batch_orders,
)
from .warehouse_routing.access_resolution import (
    chain_distance_through_location_ids,
    is_routing_graph_configured,
    packing_node_uuid,
    picking_start_node_uuid,
)
from .warehouse_routing.constants import (
    ERROR_ROUTING_GRAPH_NOT_CONFIGURED,
    PROCESS_PICKING,
    TRANSPORT_FOOT,
)

logger = logging.getLogger(__name__)

WALKING_SPEED_M_S = 1.4

LIMIT_CHOICES = (10, 25, 50, 100, 500)
DEFAULT_LIMIT = 25


def _product_ids_for_filters(
    db: Session,
    tenant_id: int,
    name: str | None,
    ean: str | None,
    sku: str | None,
) -> list[int] | None:
    """If any filter is set, return list of product ids matching Product filters; else None (no filter)."""
    if not name and not ean and not sku:
        return None
    q = db.query(Product.id).filter(Product.tenant_id == tenant_id)
    if name and name.strip():
        q = q.filter(Product.name.ilike(f"%{name.strip()}%"))
    if ean and ean.strip():
        q = q.filter(Product.ean == ean.strip())
    if sku and sku.strip():
        q = q.filter((Product.sku == sku.strip()) | (Product.symbol == sku.strip()))
    return [r.id for r in q.all()]


def product_rotation(
    db: Session,
    tenant_id: int,
    name: str | None = None,
    ean: str | None = None,
    sku: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> list[dict[str, Any]]:
    """
    Total quantity sold per product (from order_items).
    Optional product filters (name, ean, sku); limit (10, 25, 50, 100, 500).
    """
    product_ids = _product_ids_for_filters(db, tenant_id, name, ean, sku)
    if product_ids is not None and len(product_ids) == 0:
        return []
    effective_limit = limit if limit in LIMIT_CHOICES else DEFAULT_LIMIT
    q = (
        db.query(
            OrderItem.product_id,
            func.sum(OrderItem.quantity).label("total_quantity"),
        )
        .join(Order, OrderItem.order_id == Order.id)
        .filter(Order.tenant_id == tenant_id)
    )
    if product_ids is not None:
        q = q.filter(OrderItem.product_id.in_(product_ids))
    rows = (
        q.group_by(OrderItem.product_id)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(effective_limit)
        .all()
    )
    product_ids_out = [r.product_id for r in rows]
    names = {}
    if product_ids_out:
        for p in db.query(Product.id, Product.name).filter(Product.id.in_(product_ids_out)):
            names[p.id] = p.name
    return [
        {
            "product_id": r.product_id,
            "product_name": names.get(r.product_id),
            "total_quantity": int(r.total_quantity) if r.total_quantity else 0,
        }
        for r in rows
    ]


def hot_products(
    db: Session,
    tenant_id: int,
    limit: int = DEFAULT_LIMIT,
    name: str | None = None,
    ean: str | None = None,
    sku: str | None = None,
) -> list[dict[str, Any]]:
    """
    Top products by quantity ordered (order_items).
    Optional product filters; limit (10, 25, 50, 100, 500).
    """
    product_ids = _product_ids_for_filters(db, tenant_id, name, ean, sku)
    if product_ids is not None and len(product_ids) == 0:
        return []
    effective_limit = limit if limit in LIMIT_CHOICES else DEFAULT_LIMIT
    q = (
        db.query(
            OrderItem.product_id,
            func.sum(OrderItem.quantity).label("total_quantity"),
        )
        .join(Order, OrderItem.order_id == Order.id)
        .filter(Order.tenant_id == tenant_id)
    )
    if product_ids is not None:
        q = q.filter(OrderItem.product_id.in_(product_ids))
    rows = (
        q.group_by(OrderItem.product_id)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(effective_limit)
        .all()
    )
    product_ids_out = [r.product_id for r in rows]
    names = {}
    if product_ids_out:
        for p in db.query(Product.id, Product.name).filter(Product.id.in_(product_ids_out)):
            names[p.id] = p.name
    return [
        {
            "product_id": r.product_id,
            "product_name": names.get(r.product_id),
            "total_quantity": int(r.total_quantity) if r.total_quantity else 0,
        }
        for r in rows
    ]


# Inventory aging category thresholds (days since last sale)
CATEGORY_FAST_DAYS = 30
CATEGORY_SLOW_DAYS = 90
NEVER_SOLD_DAYS_PLACEHOLDER = 99999  # for sorting products that never sold


def dead_stock(
    db: Session,
    tenant_id: int,
    days: int = 90,
    name: str | None = None,
    ean: str | None = None,
    sku: str | None = None,
    sales_start_date: date | None = None,
    sales_end_date: date | None = None,
    limit: int = 25,
) -> dict[str, Any]:
    """
    Inventory aging: products with inventory > 0, with last_sale_date, days_since_last_sale,
    inventory_value, sales_last_30/90_days, rotation_rate, category. Uses COALESCE(order_date, created_at).
    Optional: product filters (name LIKE, ean, sku), sales date range (orders filtered by order_date),
    limit (max rows). Returns { "items": [...], "summary": {...} }.
    """
    from datetime import datetime as dt_class
    now = datetime.utcnow()
    use_sales_window = sales_start_date is not None and sales_end_date is not None and sales_start_date <= sales_end_date
    if use_sales_window:
        start_dt = dt_class.combine(sales_start_date, dt_class.min.time())
        end_dt = dt_class.combine(sales_end_date, dt_class.max.time())
    else:
        start_dt = now - timedelta(days=30)
        end_dt = now
    since_30 = now - timedelta(days=30)
    since_90 = now - timedelta(days=90)
    order_date_expr = func.coalesce(Order.order_date, Order.created_at)

    # 1) Last sale per product (optionally within sales date window)
    last_sale_q = (
        db.query(
            OrderItem.product_id,
            func.max(order_date_expr).label("last_sale_date"),
        )
        .join(Order, OrderItem.order_id == Order.id)
        .filter(Order.tenant_id == tenant_id)
    )
    if use_sales_window:
        last_sale_q = last_sale_q.filter(
            order_date_expr >= start_dt,
            order_date_expr <= end_dt,
        )
    last_sale_rows = last_sale_q.group_by(OrderItem.product_id).all()
    last_sale_by_product: dict[int, datetime | None] = {r.product_id: r.last_sale_date for r in last_sale_rows}

    # 2) Inventory totals per product (quantity > 0)
    inv_totals = (
        db.query(Inventory.product_id, func.sum(Inventory.quantity).label("qty"))
        .filter(Inventory.tenant_id == tenant_id)
        .group_by(Inventory.product_id)
        .having(func.sum(Inventory.quantity) > 0)
        .all()
    )
    if not inv_totals:
        return {
            "items": [],
            "summary": {
                "fast_moving_value": 0.0,
                "slow_moving_value": 0.0,
                "dead_stock_value": 0.0,
                "total_inventory_value": 0.0,
            },
        }

    product_ids = [p for p, _ in inv_totals]
    qty_by_product = {p: float(q) for p, q in inv_totals}

    # 2b) Apply product filters (name, ean, sku)
    product_filter_q = db.query(Product.id).filter(Product.id.in_(product_ids))
    if name and name.strip():
        product_filter_q = product_filter_q.filter(Product.name.ilike(f"%{name.strip()}%"))
    if ean and ean.strip():
        product_filter_q = product_filter_q.filter(Product.ean == ean.strip())
    if sku and sku.strip():
        product_filter_q = product_filter_q.filter(
            (Product.sku == sku.strip()) | (Product.symbol == sku.strip())
        )
    filtered_ids = {r.id for r in product_filter_q.all()}
    product_ids = [p for p in product_ids if p in filtered_ids]
    if not product_ids:
        return {
            "items": [],
            "summary": {
                "fast_moving_value": 0.0,
                "slow_moving_value": 0.0,
                "dead_stock_value": 0.0,
                "total_inventory_value": 0.0,
            },
        }

    # 3) Product names and purchase_price (NULL → 0 for value)
    products_info = (
        db.query(Product.id, Product.name, Product.purchase_price)
        .filter(Product.id.in_(product_ids))
        .all()
    )
    names: dict[int, str | None] = {}
    purchase_price_by_product: dict[int, float] = {}
    for p in products_info:
        names[p.id] = p.name
        purchase_price_by_product[p.id] = float(p.purchase_price or 0)

    # 4) Sales last 30 days per product (or sales in window when date range set)
    sales_30_q = (
        db.query(OrderItem.product_id, func.sum(OrderItem.quantity).label("sales"))
        .join(Order, OrderItem.order_id == Order.id)
        .filter(Order.tenant_id == tenant_id)
    )
    if use_sales_window:
        sales_30_q = sales_30_q.filter(order_date_expr >= start_dt, order_date_expr <= end_dt)
    else:
        sales_30_q = sales_30_q.filter(order_date_expr >= since_30)
    sales_30_rows = sales_30_q.group_by(OrderItem.product_id).all()
    sales_30_by_product = {r.product_id: int(r.sales or 0) for r in sales_30_rows}

    # 5) Sales last 90 days per product (or same window when date range set)
    sales_90_q = (
        db.query(OrderItem.product_id, func.sum(OrderItem.quantity).label("sales"))
        .join(Order, OrderItem.order_id == Order.id)
        .filter(Order.tenant_id == tenant_id)
    )
    if use_sales_window:
        sales_90_q = sales_90_q.filter(order_date_expr >= start_dt, order_date_expr <= end_dt)
    else:
        sales_90_q = sales_90_q.filter(order_date_expr >= since_90)
    sales_90_rows = sales_90_q.group_by(OrderItem.product_id).all()
    sales_90_by_product = {r.product_id: int(r.sales or 0) for r in sales_90_rows}

    # Build items: inventory_value, days_since_last_sale, rotation_rate, category
    items: list[dict[str, Any]] = []
    for pid in product_ids:
        qty = qty_by_product.get(pid, 0)
        price = purchase_price_by_product.get(pid, 0)
        inventory_value = round(qty * price, 2)
        last_sale_date = last_sale_by_product.get(pid)
        if last_sale_date is not None:
            delta = now - last_sale_date
            days_since_last_sale = delta.days
        else:
            days_since_last_sale = None  # never sold
        sales_30 = sales_30_by_product.get(pid, 0)
        sales_90 = sales_90_by_product.get(pid, 0)
        rotation_rate = round(sales_90 / qty, 4) if qty else 0.0

        # Category: FAST_MOVING < 30, SLOW_MOVING 30–90, DEAD_STOCK > 90 (or never sold)
        if days_since_last_sale is None:
            category = "DEAD_STOCK"
            sort_days = NEVER_SOLD_DAYS_PLACEHOLDER
        elif days_since_last_sale < CATEGORY_FAST_DAYS:
            category = "FAST_MOVING"
            sort_days = days_since_last_sale
        elif days_since_last_sale <= CATEGORY_SLOW_DAYS:
            category = "SLOW_MOVING"
            sort_days = days_since_last_sale
        else:
            category = "DEAD_STOCK"
            sort_days = days_since_last_sale

        # Backward compat: days_without_sales (actual or param for never sold)
        days_without_sales = days_since_last_sale if days_since_last_sale is not None else days

        last_sale_str = last_sale_date.isoformat() if last_sale_date else None

        items.append({
            "product_id": pid,
            "product_name": names.get(pid),
            "inventory_quantity": round(qty, 2),
            "inventory_value": inventory_value,
            "last_sale_date": last_sale_str,
            "days_since_last_sale": days_since_last_sale,
            "days_without_sales": days_without_sales,
            "sales_last_30_days": sales_30,
            "sales_last_90_days": sales_90,
            "rotation_rate": rotation_rate,
            "category": category,
            "_sort_days": sort_days,
        })

    # Sort: days_since_last_sale DESC (oldest first), then inventory_value DESC
    items.sort(key=lambda x: (-x["_sort_days"], -x["inventory_value"]))
    for x in items:
        del x["_sort_days"]

    # Apply limit (allowed: 10, 25, 50, 100, 500)
    if limit not in (10, 25, 50, 100, 500):
        limit = 25
    items = items[:limit]

    # Summary: total inventory value by category (of limited result set)
    fast_moving_value = sum(i["inventory_value"] for i in items if i["category"] == "FAST_MOVING")
    slow_moving_value = sum(i["inventory_value"] for i in items if i["category"] == "SLOW_MOVING")
    dead_stock_value = sum(i["inventory_value"] for i in items if i["category"] == "DEAD_STOCK")
    total_inventory_value = fast_moving_value + slow_moving_value + dead_stock_value

    # Category percentages (0 if total is 0)
    fast_percentage = round(100.0 * fast_moving_value / total_inventory_value, 2) if total_inventory_value else 0.0
    slow_percentage = round(100.0 * slow_moving_value / total_inventory_value, 2) if total_inventory_value else 0.0
    dead_percentage = round(100.0 * dead_stock_value / total_inventory_value, 2) if total_inventory_value else 0.0

    # Product value share: inventory_value / total_inventory_value (0–1)
    for x in items:
        x["product_value_share"] = round(x["inventory_value"] / total_inventory_value, 6) if total_inventory_value else 0.0

    return {
        "items": items,
        "summary": {
            "fast_moving_value": round(fast_moving_value, 2),
            "slow_moving_value": round(slow_moving_value, 2),
            "dead_stock_value": round(dead_stock_value, 2),
            "total_inventory_value": round(total_inventory_value, 2),
            "fast_percentage": fast_percentage,
            "slow_percentage": slow_percentage,
            "dead_percentage": dead_percentage,
        },
    }


# dm³ per unit: if product.volume is NULL, compute from length×width×height (cm³ → dm³)
def _product_volume_dm3(volume: float | None, length: float | None, width: float | None, height: float | None) -> float:
    if volume is not None and volume > 0:
        return float(volume)
    if length is not None and width is not None and height is not None and all(x and x > 0 for x in (length, width, height)):
        return (float(length) * float(width) * float(height)) / 1000.0  # cm³ → dm³
    return 0.0


def dead_stock_space(
    db: Session,
    warehouse_id: int,
    tenant_id: int,
    limit: int = 50,
) -> dict[str, Any]:
    """
    Dead stock space usage: how much physical warehouse space (dm³) is occupied by
    fast / slow / dead stock. Uses: products (volume or length×width×height), inventory,
    orders+order_items for last_sale_date. No schema changes.
    Returns { totals: { total_volume, fast_volume, slow_volume, dead_volume, fast_percentage, slow_percentage, dead_percentage }, products: [...] }.
    """
    now = datetime.utcnow()
    order_date_expr = func.coalesce(Order.order_date, Order.created_at)

    # 1) Last sale per product (tenant)
    last_sale_rows = (
        db.query(
            OrderItem.product_id,
            func.max(order_date_expr).label("last_sale_date"),
        )
        .join(Order, OrderItem.order_id == Order.id)
        .filter(Order.tenant_id == tenant_id)
        .group_by(OrderItem.product_id)
        .all()
    )
    last_sale_by_product: dict[int, datetime | None] = {r.product_id: r.last_sale_date for r in last_sale_rows}

    # 2) Inventory in this warehouse (quantity > 0), sum quantity per product
    inv_totals = (
        db.query(Inventory.product_id, func.sum(Inventory.quantity).label("qty"))
        .filter(
            Inventory.tenant_id == tenant_id,
            Inventory.warehouse_id == warehouse_id,
        )
        .group_by(Inventory.product_id)
        .having(func.sum(Inventory.quantity) > 0)
        .all()
    )
    if not inv_totals:
        return {
            "totals": {
                "total_volume": 0.0,
                "fast_volume": 0.0,
                "slow_volume": 0.0,
                "dead_volume": 0.0,
                "fast_percentage": 0.0,
                "slow_percentage": 0.0,
                "dead_percentage": 0.0,
            },
            "products": [],
        }

    product_ids = [p for p, _ in inv_totals]
    qty_by_product = {p: float(q) for p, q in inv_totals}

    # 3) Product names and volume (volume or length×width×height in dm³)
    products_info = (
        db.query(Product.id, Product.name, Product.volume, Product.length, Product.width, Product.height)
        .filter(Product.id.in_(product_ids))
        .all()
    )
    names: dict[int, str | None] = {}
    volume_dm3_by_product: dict[int, float] = {}
    for p in products_info:
        names[p.id] = p.name
        volume_dm3_by_product[p.id] = _product_volume_dm3(
            float(p.volume) if p.volume is not None else None,
            float(p.length) if p.length is not None else None,
            float(p.width) if p.width is not None else None,
            float(p.height) if p.height is not None else None,
        )

    # 4) Build per-product: occupied_volume, days_since_last_sale, category
    rows_for_totals: list[tuple[float, str]] = []  # (occupied_volume, category)
    products_list: list[dict[str, Any]] = []
    for pid in product_ids:
        qty = qty_by_product.get(pid, 0)
        vol_per_unit = volume_dm3_by_product.get(pid, 0)
        occupied_volume = round(qty * vol_per_unit, 2)
        last_sale_date = last_sale_by_product.get(pid)
        if last_sale_date is not None:
            delta = now - last_sale_date
            days_since_last_sale = delta.days
        else:
            days_since_last_sale = None
        if days_since_last_sale is None or days_since_last_sale >= CATEGORY_SLOW_DAYS:
            category = "DEAD_STOCK"
        elif days_since_last_sale < CATEGORY_FAST_DAYS:
            category = "FAST_MOVING"
        else:
            category = "SLOW_MOVING"
        rows_for_totals.append((occupied_volume, category))
        products_list.append({
            "product_id": pid,
            "product_name": names.get(pid),
            "quantity": round(qty, 2),
            "product_volume": round(vol_per_unit, 2),
            "occupied_volume": occupied_volume,
            "days_since_last_sale": days_since_last_sale,
            "category": category,
        })

    # 5) Sort by occupied_volume DESC, take top limit
    products_list.sort(key=lambda x: -x["occupied_volume"])
    products_list = products_list[: max(1, limit)]

    # 6) Totals and percentages (over all products in warehouse, not just top N)
    total_volume = sum(r[0] for r in rows_for_totals)
    fast_volume = sum(r[0] for r in rows_for_totals if r[1] == "FAST_MOVING")
    slow_volume = sum(r[0] for r in rows_for_totals if r[1] == "SLOW_MOVING")
    dead_volume = sum(r[0] for r in rows_for_totals if r[1] == "DEAD_STOCK")
    fast_percentage = round(100.0 * fast_volume / total_volume, 2) if total_volume else 0.0
    slow_percentage = round(100.0 * slow_volume / total_volume, 2) if total_volume else 0.0
    dead_percentage = round(100.0 * dead_volume / total_volume, 2) if total_volume else 0.0

    return {
        "totals": {
            "total_volume": round(total_volume, 2),
            "fast_volume": round(fast_volume, 2),
            "slow_volume": round(slow_volume, 2),
            "dead_volume": round(dead_volume, 2),
            "fast_percentage": fast_percentage,
            "slow_percentage": slow_percentage,
            "dead_percentage": dead_percentage,
        },
        "products": products_list,
    }


def pick_density(
    db: Session,
    tenant_id: int,
    warehouse_id: int | None = None,
) -> list[dict[str, Any]]:
    """
    Temporary: order_items quantity grouped by location.
    Each product is assigned to one location (primary inventory row: max quantity per product).
    Uses: order_items, orders, inventory, locations.
    """
    # One location per product (min location_id per product) for this tenant/warehouse
    inv_filter = [Inventory.tenant_id == tenant_id]
    if warehouse_id is not None:
        inv_filter.append(Inventory.warehouse_id == warehouse_id)
    subq = (
        db.query(
            Inventory.product_id,
            func.min(Inventory.location_id).label("location_id"),
        )
        .filter(*inv_filter)
        .group_by(Inventory.product_id)
        .subquery()
    )
    # order_items -> join subq by product_id -> join order (tenant) -> sum quantity by location_id
    rows = (
        db.query(
            subq.c.location_id,
            func.sum(OrderItem.quantity).label("total_quantity"),
        )
        .select_from(OrderItem)
        .join(Order, OrderItem.order_id == Order.id)
        .join(subq, subq.c.product_id == OrderItem.product_id)
        .filter(Order.tenant_id == tenant_id)
        .group_by(subq.c.location_id)
        .all()
    )
    location_ids = [r.location_id for r in rows]
    loc_names = {}
    if location_ids:
        for loc in db.query(Location.id, Location.name).filter(Location.id.in_(location_ids)):
            loc_names[loc.id] = loc.name
    return [
        {
            "location_id": r.location_id,
            "location_name": loc_names.get(r.location_id),
            "total_quantity": int(r.total_quantity) if r.total_quantity else 0,
        }
        for r in rows
    ]


def product_pairs(
    db: Session,
    tenant_id: int,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """
    Products bought together (same order). Uses order_items only.
    SELECT oi1.product_id, oi2.product_id, COUNT(*) as frequency
    FROM order_items oi1
    JOIN order_items oi2 ON oi1.order_id = oi2.order_id AND oi1.product_id < oi2.product_id
    JOIN orders ON oi1.order_id = orders.id
    WHERE orders.tenant_id = ?
    GROUP BY oi1.product_id, oi2.product_id
    ORDER BY frequency DESC LIMIT ?
    """
    oi1 = aliased(OrderItem)
    oi2 = aliased(OrderItem)
    rows = (
        db.query(
            oi1.product_id.label("product_id_a"),
            oi2.product_id.label("product_id_b"),
            func.count().label("frequency"),
        )
        .select_from(oi1)
        .join(oi2, and_(oi1.order_id == oi2.order_id, oi1.product_id < oi2.product_id))
        .join(Order, oi1.order_id == Order.id)
        .filter(Order.tenant_id == tenant_id)
        .group_by(oi1.product_id, oi2.product_id)
        .order_by(func.count().desc())
        .limit(max(1, limit))
        .all()
    )
    product_ids = set()
    for r in rows:
        product_ids.add(r.product_id_a)
        product_ids.add(r.product_id_b)
    names = {}
    if product_ids:
        for p in db.query(Product.id, Product.name).filter(Product.id.in_(product_ids)):
            names[p.id] = p.name
    return [
        {
            "product_id_a": r.product_id_a,
            "product_id_b": r.product_id_b,
            "product_name_a": names.get(r.product_id_a),
            "product_name_b": names.get(r.product_id_b),
            "frequency": int(r.frequency) if r.frequency else 0,
        }
        for r in rows
    ]


def hot_locations(
    db: Session,
    tenant_id: int,
    warehouse_id: int | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """
    Hot locations from picks: SUM(quantity) per location_id.
    Uses picks -> location. Returns total_picked (historical) and current_stock (inventory).
    """
    pick_filter = [Pick.tenant_id == tenant_id]
    if warehouse_id is not None:
        pick_filter.append(Pick.warehouse_id == warehouse_id)
    rows = (
        db.query(
            Pick.location_id,
            func.sum(Pick.quantity).label("total_picked"),
        )
        .filter(*pick_filter)
        .group_by(Pick.location_id)
        .order_by(func.sum(Pick.quantity).desc())
        .limit(max(1, limit))
        .all()
    )
    location_ids = [r.location_id for r in rows]
    loc_names = {}
    if location_ids:
        for loc in db.query(Location.id, Location.name).filter(Location.id.in_(location_ids)):
            loc_names[loc.id] = loc.name
    # Current inventory quantity per location (same tenant/warehouse filter)
    stock_by_loc: dict[int, int] = {}
    if location_ids:
        inv_filter = [Inventory.tenant_id == tenant_id, Inventory.location_id.in_(location_ids)]
        if warehouse_id is not None:
            inv_filter.append(Inventory.warehouse_id == warehouse_id)
        stock_rows = (
            db.query(Inventory.location_id, func.sum(Inventory.quantity).label("current_stock"))
            .filter(*inv_filter)
            .group_by(Inventory.location_id)
            .all()
        )
        stock_by_loc = {r.location_id: int(r.current_stock) if r.current_stock else 0 for r in stock_rows}
    return [
        {
            "location_id": r.location_id,
            "location_name": loc_names.get(r.location_id),
            "total_quantity": int(r.total_picked) if r.total_picked else 0,
            "current_stock": stock_by_loc.get(r.location_id, 0),
        }
        for r in rows
    ]


def picking_analysis_summary(
    db: Session,
    tenant_id: int,
    warehouse_id: int | None = None,
) -> dict[str, Any]:
    """
    Summary metrics from picks table: total_picks, total_picked_quantity,
    avg_picks_per_order, avg_locations_per_order.
    """
    pick_filter = [Pick.tenant_id == tenant_id]
    if warehouse_id is not None:
        pick_filter.append(Pick.warehouse_id == warehouse_id)
    total_picks = db.query(func.count(Pick.id)).filter(*pick_filter).scalar() or 0
    total_qty_row = (
        db.query(func.coalesce(func.sum(Pick.quantity), 0).label("total"))
        .filter(*pick_filter)
        .first()
    )
    total_picked_quantity = int(total_qty_row.total) if total_qty_row else 0
    distinct_orders = (
        db.query(func.count(func.distinct(Pick.order_id))).filter(*pick_filter).scalar() or 0
    )
    avg_picks_per_order = round(total_picks / distinct_orders, 2) if distinct_orders else 0.0
    # Avg locations per order: for each order count distinct location_id, then average
    subq = (
        db.query(
            Pick.order_id,
            func.count(func.distinct(Pick.location_id)).label("loc_count"),
        )
        .filter(*pick_filter)
        .group_by(Pick.order_id)
        .subquery()
    )
    avg_loc_row = db.query(func.avg(subq.c.loc_count)).select_from(subq).first()
    avg_locations_per_order = round(float(avg_loc_row[0] or 0), 2)
    return {
        "total_picks": total_picks,
        "total_picked_quantity": total_picked_quantity,
        "avg_picks_per_order": avg_picks_per_order,
        "avg_locations_per_order": avg_locations_per_order,
    }


def picking_analysis_list(
    db: Session,
    tenant_id: int,
    warehouse_id: int | None = None,
    product_name: str | None = None,
    sku: str | None = None,
    ean: str | None = None,
    location_name: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    """
    List picks with order_id, product name, sku, location name, quantity, picked_at.
    Filters: product_name (LIKE), sku (Product.symbol), ean, location_name (LIKE), date_from, date_to.
    """
    pick_filter = [Pick.tenant_id == tenant_id]
    if warehouse_id is not None:
        pick_filter.append(Pick.warehouse_id == warehouse_id)
    if date_from is not None:
        pick_filter.append(func.date(Pick.picked_at) >= date_from)
    if date_to is not None:
        pick_filter.append(func.date(Pick.picked_at) <= date_to)
    q = (
        db.query(Pick)
        .filter(*pick_filter)
        .options(joinedload(Pick.product), joinedload(Pick.location))
        .join(Product, Pick.product_id == Product.id)
        .join(Location, Pick.location_id == Location.id)
    )
    if product_name and product_name.strip():
        q = q.filter(Product.name.ilike(f"%{product_name.strip()}%"))
    if sku and sku.strip():
        q = q.filter(Product.symbol.ilike(f"%{sku.strip()}%"))
    if ean and ean.strip():
        q = q.filter(Product.ean.ilike(f"%{ean.strip()}%"))
    if location_name and location_name.strip():
        q = q.filter(Location.name.ilike(f"%{location_name.strip()}%"))
    rows = (
        q.order_by(Pick.picked_at.desc().nullslast(), Pick.id.desc())
        .limit(max(1, min(limit, 2000)))
        .all()
    )
    return [
        {
            "id": p.id,
            "order_id": p.order_id,
            "product_name": p.product.name if p.product else None,
            "sku": p.product.symbol if p.product else None,
            "location_name": p.location.name if p.location else None,
            "quantity": int(p.quantity) if p.quantity else 0,
            "picked_at": p.picked_at.isoformat() if p.picked_at else None,
        }
        for p in rows
    ]


def generate_simulated_picks(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    replace_existing: bool = True,
) -> dict[str, Any]:
    """
    Generate simulated Pick records from orders and inventory. Does NOT modify inventory.
    For each order in the warehouse, for each order_item: find inventory locations for the product
    (ordered by location.pick_sequence), allocate quantity across locations, create Pick records.
    If replace_existing=True, deletes existing picks for this tenant+warehouse first.
    Returns { created, orders_processed }.
    """
    if replace_existing:
        db.query(Pick).filter(
            Pick.tenant_id == tenant_id,
            Pick.warehouse_id == warehouse_id,
        ).delete(synchronize_session=False)
        db.flush()
    now = datetime.utcnow()
    orders = (
        db.query(Order)
        .filter(Order.tenant_id == tenant_id, Order.warehouse_id == warehouse_id)
        .all()
    )
    created = 0
    for order in orders:
        items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
        for item in items:
            # Inventory rows for this product in this warehouse, with location pick_sequence
            inv_rows = (
                db.query(Inventory, Location.pick_sequence, Bin.storage_type)
                .join(Location, Inventory.location_id == Location.id)
                .outerjoin(Bin, Bin.location_uuid == Location.location_uuid)
                .filter(
                    Inventory.tenant_id == tenant_id,
                    Inventory.warehouse_id == warehouse_id,
                    Inventory.product_id == item.product_id,
                    Inventory.quantity > 0,
                    or_(
                        Bin.id.is_(None),
                        Bin.storage_type.is_(None),
                        ~func.lower(Bin.storage_type).in_(tuple(NON_PICKABLE_STORAGE_TYPE_ALIASES)),
                    ),
                )
                .all()
            )
            inv_rows = sorted(
                inv_rows,
                key=lambda row: (
                    get_storage_priority(row[2]) or 999999,
                    row[1] if row[1] is not None else 999999,
                    row[0].location_id,
                ),
            )
            remaining = float(item.quantity)
            for inv, _pick_seq, _storage_type in inv_rows:
                if remaining <= 0:
                    break
                qty = min(remaining, float(inv.quantity))
                if qty <= 0:
                    continue
                db.add(
                    Pick(
                        tenant_id=tenant_id,
                        warehouse_id=warehouse_id,
                        order_id=order.id,
                        order_item_id=item.id,
                        product_id=item.product_id,
                        location_id=inv.location_id,
                        quantity=qty,
                        picked_at=now,
                        picker_id=None,
                        status="done",
                    )
                )
                created += 1
                remaining -= qty
    db.commit()
    return {"created": created, "orders_processed": len(orders)}


def delete_simulated_picks(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
) -> dict[str, Any]:
    """
    Delete all picks for the given tenant and warehouse.
    Used to clear simulated picks data.
    Returns { deleted: count }.
    """
    result = db.query(Pick).filter(
        Pick.tenant_id == tenant_id,
        Pick.warehouse_id == warehouse_id,
    ).delete(synchronize_session=False)
    db.commit()
    return {"deleted": result}


def picking_heatmap(
    db: Session,
    tenant_id: int,
    warehouse_id: int | None = None,
) -> list[dict[str, Any]]:
    """
    Per-location pick stats for heatmap: location_id, location_name, x, y,
    total_picks (count), total_quantity (sum), unique_orders, products_picked (distinct product_id).
    """
    pick_filter = [Pick.tenant_id == tenant_id]
    if warehouse_id is not None:
        pick_filter.append(Pick.warehouse_id == warehouse_id)
    rows = (
        db.query(
            Pick.location_id,
            func.count(Pick.id).label("total_picks"),
            func.coalesce(func.sum(Pick.quantity), 0).label("total_quantity"),
            func.count(func.distinct(Pick.order_id)).label("unique_orders"),
            func.count(func.distinct(Pick.product_id)).label("products_picked"),
        )
        .filter(*pick_filter)
        .group_by(Pick.location_id)
        .all()
    )
    location_ids = [r.location_id for r in rows]
    loc_map = {}
    if location_ids:
        for loc in (
            db.query(Location.id, Location.name, Location.x, Location.y)
            .filter(Location.id.in_(location_ids))
            .all()
        ):
            loc_map[loc.id] = {
                "name": loc.name,
                "x": float(loc.x) if loc.x is not None else None,
                "y": float(loc.y) if loc.y is not None else None,
            }
    return [
        {
            "location_id": r.location_id,
            "location_name": loc_map.get(r.location_id, {}).get("name"),
            "x": loc_map.get(r.location_id, {}).get("x"),
            "y": loc_map.get(r.location_id, {}).get("y"),
            "total_picks": int(r.total_picks) if r.total_picks else 0,
            "total_quantity": int(r.total_quantity) if r.total_quantity else 0,
            "unique_orders": int(r.unique_orders) if r.unique_orders else 0,
            "products_picked": int(r.products_picked) if r.products_picked else 0,
        }
        for r in rows
    ]


def batch_picking(
    db: Session,
    tenant_id: int,
    limit: int = DEFAULT_LIMIT,
    name: str | None = None,
    ean: str | None = None,
    sku: str | None = None,
) -> list[dict[str, Any]]:
    """
    Total picks per product from order_items. No picks table.
    Optional product filters; limit (10, 25, 50, 100, 500).
    """
    product_ids = _product_ids_for_filters(db, tenant_id, name, ean, sku)
    if product_ids is not None and len(product_ids) == 0:
        return []
    effective_limit = limit if limit in LIMIT_CHOICES else DEFAULT_LIMIT
    q = (
        db.query(
            OrderItem.product_id,
            func.sum(OrderItem.quantity).label("total_picks"),
        )
        .join(Order, OrderItem.order_id == Order.id)
        .filter(Order.tenant_id == tenant_id)
    )
    if product_ids is not None:
        q = q.filter(OrderItem.product_id.in_(product_ids))
    rows = (
        q.group_by(OrderItem.product_id)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(effective_limit)
        .all()
    )
    product_ids_out = [r.product_id for r in rows]
    names = {}
    if product_ids_out:
        for p in db.query(Product.id, Product.name).filter(Product.id.in_(product_ids_out)):
            names[p.id] = p.name
    return [
        {
            "product_id": r.product_id,
            "product_name": names.get(r.product_id),
            "total_picks": int(r.total_picks) if r.total_picks else 0,
        }
        for r in rows
    ]


def _products_with_assigned_but_no_inventory(
    db: Session,
    product_ids: list[int],
    product_to_location: dict[int, int],
) -> list[int]:
    """
    Return product_ids that have no inventory record but have assigned_locations set.
    Used to emit analytics warning: "product has assigned location but no inventory record".
    """
    missing = [pid for pid in product_ids if pid not in product_to_location]
    if not missing:
        return []
    products = (
        db.query(Product.id)
        .filter(
            Product.id.in_(missing),
            Product.assigned_locations.isnot(None),
            Product.assigned_locations != "",
        )
        .all()
    )
    return [p.id for p in products]


def walking_cost(
    db: Session,
    tenant_id: int,
    warehouse_id: int | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    """
    Walking-cost via authored Warehouse Routing Graph (SSOT).
    orders → items → inventory → location → Access Points → Routing Engine.
    Context: process=picking, transport=foot.
    No Euclidean fallback; missing graph → total_distance null + ROUTING_GRAPH_NOT_CONFIGURED.
    """
    order_filter = [Order.tenant_id == tenant_id]
    if warehouse_id is not None:
        order_filter.append(Order.warehouse_id == warehouse_id)
    orders = (
        db.query(Order.id, Order.number, Order.warehouse_id)
        .filter(*order_filter)
        .order_by(Order.id.desc())
        .limit(max(1, limit))
        .all()
    )
    if not orders:
        return []

    order_ids = [o.id for o in orders]
    wh_ids = list({o.warehouse_id for o in orders})

    items_by_order: dict[int, list[tuple[int, int]]] = {oid: [] for oid in order_ids}
    for oi in db.query(OrderItem.order_id, OrderItem.product_id, OrderItem.quantity).filter(
        OrderItem.order_id.in_(order_ids)
    ):
        items_by_order[oi.order_id].append((oi.product_id, int(oi.quantity or 0)))

    inv_filter = [Inventory.tenant_id == tenant_id, Inventory.warehouse_id.in_(wh_ids)]
    inv_rows = (
        db.query(
            Inventory.warehouse_id,
            Inventory.product_id,
            Inventory.location_id,
            Location.pick_sequence,
            Bin.storage_type,
        )
        .join(Location, Inventory.location_id == Location.id)
        .outerjoin(Bin, Bin.location_uuid == Location.location_uuid)
        .filter(
            *inv_filter,
            or_(
                Bin.id.is_(None),
                Bin.storage_type.is_(None),
                ~func.lower(Bin.storage_type).in_(tuple(NON_PICKABLE_STORAGE_TYPE_ALIASES)),
            ),
        )
        .all()
    )
    key_to_loc: dict[tuple[int, int], tuple[int, int, int]] = {}
    for r in inv_rows:
        k = (r.warehouse_id, r.product_id)
        priority = get_storage_priority(r.storage_type) or 999999
        effective_seq = r.pick_sequence if r.pick_sequence is not None else 999999
        candidate = (r.location_id, priority, effective_seq)
        if k not in key_to_loc or (priority, effective_seq, r.location_id) < (
            key_to_loc[k][1],
            key_to_loc[k][2],
            key_to_loc[k][0],
        ):
            key_to_loc[k] = candidate

    wh_configured = {wid: is_routing_graph_configured(db, wid) for wid in wh_ids}
    wh_start = {wid: picking_start_node_uuid(db, wid) for wid in wh_ids}
    wh_pack = {wid: packing_node_uuid(db, wid) for wid in wh_ids}

    result = []
    for o in orders:
        wh_id = o.warehouse_id
        total_items = 0
        loc_seq: list[int] = []
        seen_loc: set[int] = set()
        for product_id, qty in items_by_order.get(o.id) or []:
            total_items += qty
            loc_id = key_to_loc.get((wh_id, product_id), (None, 0, 0))[0]
            if loc_id is not None and loc_id not in seen_loc:
                seen_loc.add(loc_id)
                loc_seq.append(loc_id)

        if not wh_configured.get(wh_id):
            result.append({
                "order_id": o.id,
                "order_number": o.number,
                "total_distance": None,
                "distance_available": False,
                "routing_status": ERROR_ROUTING_GRAPH_NOT_CONFIGURED,
                "distinct_locations_count": len(loc_seq),
                "total_items": total_items,
            })
            continue

        start_uuid = wh_start.get(wh_id)
        end_uuid = wh_pack.get(wh_id)
        if not start_uuid:
            result.append({
                "order_id": o.id,
                "order_number": o.number,
                "total_distance": None,
                "distance_available": False,
                "routing_status": ERROR_ROUTING_GRAPH_NOT_CONFIGURED,
                "distinct_locations_count": len(loc_seq),
                "total_items": total_items,
            })
            continue

        dist, err, _path = chain_distance_through_location_ids(
            db,
            wh_id,
            loc_seq,
            start_node_uuid=start_uuid,
            end_node_uuid=end_uuid,
            process_type=PROCESS_PICKING,
            transport_type=TRANSPORT_FOOT,
        )
        result.append({
            "order_id": o.id,
            "order_number": o.number,
            "total_distance": round(dist, 2) if dist is not None else None,
            "distance_available": dist is not None,
            "routing_status": err,
            "distinct_locations_count": len(loc_seq),
            "total_items": total_items,
        })

    result.sort(
        key=lambda r: (
            -(r["total_distance"] if r["total_distance"] is not None else -1),
            r["order_id"],
        )
    )
    return result


def get_pick_route(db: Session, order_number: str, record_picks: bool = False) -> dict[str, Any]:
    """
    Shortest walking route: START (PICK_START) → pick locations (nearest neighbor) → PACKING.
    Uses unified simulation engine (domain/simulation). If record_picks=True, creates Pick records (no inventory change) for analytics.
    """
    order = (
        db.query(Order)
        .filter(Order.number == order_number)
        .first()
    )
    if not order:
        return {
            "warehouse_id": None,
            "route": [],
            "start": None,
            "end": None,
            "total_distance": 0.0,
            "estimated_time": 0.0,
            "pick_locations": [],
            "mapped_nodes": [],
            "order_number": order_number,
            "order_id": None,
            "order_found": False,
            "order_items": 0,
            "inventory_locations": 0,
            "mapped_nodes_count": 0,
            "error": "Order not found",
        }

    items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
    product_ids = [i.product_id for i in items]
    sim = simulate_single_order(db, order, record_picks=record_picks)

    if sim.get("error") == "routing_graph_not_configured":
        return {
            "warehouse_id": sim["warehouse_id"],
            "route": [],
            "start": None,
            "end": None,
            "total_distance": None,
            "estimated_time": None,
            "pick_locations": [],
            "mapped_nodes": [],
            "order_number": order.number,
            "order_id": order.id,
            "order_found": True,
            "order_items": len(items),
            "inventory_locations": 0,
            "mapped_nodes_count": 0,
            "distance_available": False,
            "routing_status": ERROR_ROUTING_GRAPH_NOT_CONFIGURED,
            "error": "Brak skonfigurowanej sieci tras",
        }
    if sim.get("error") == "no_pick_start":
        return {
            "warehouse_id": sim["warehouse_id"],
            "route": [],
            "start": None,
            "end": None,
            "total_distance": 0.0,
            "estimated_time": 0.0,
            "pick_locations": [],
            "mapped_nodes": [],
            "order_number": order.number,
            "order_id": order.id,
            "order_found": True,
            "order_items": 0,
            "inventory_locations": 0,
            "mapped_nodes_count": 0,
            "error": "No picking start location defined",
        }
    if sim.get("error") == "no_packing":
        return {
            "warehouse_id": sim["warehouse_id"],
            "route": [],
            "start": None,
            "end": None,
            "total_distance": 0.0,
            "estimated_time": 0.0,
            "pick_locations": [],
            "mapped_nodes": [],
            "order_number": order.number,
            "order_id": order.id,
            "order_found": True,
            "order_items": 0,
            "inventory_locations": 0,
            "mapped_nodes_count": 0,
            "error": "No packing location defined",
        }

    start_xy = sim.get("start_xy") or (0.0, 0.0)
    end_xy = sim.get("end_xy") or (0.0, 0.0)
    product_to_location = sim.get("product_to_location") or {}
    location_ids = sim.get("location_ids") or []
    pick_nodes = sim.get("pick_nodes") or []
    loc_names = sim.get("loc_names") or {}
    loc_info = sim.get("loc_info") or {}
    node_to_location = sim.get("node_to_location") or {}

    warnings: list[str] = []
    for pid in _products_with_assigned_but_no_inventory(db, product_ids, product_to_location):
        warnings.append(f"product {pid} has assigned location but no inventory record")

    if not product_ids:
        return {
            "warehouse_id": sim["warehouse_id"],
            "route": [],
            "start": {"x": start_xy[0], "y": start_xy[1]},
            "end": {"x": end_xy[0], "y": end_xy[1]},
            "total_distance": 0.0,
            "estimated_time": 0.0,
            "pick_locations": [],
            "mapped_nodes": [],
            "order_number": order.number,
            "order_id": order.id,
            "order_found": True,
            "order_items": len(items),
            "inventory_locations": 0,
            "mapped_nodes_count": 0,
        }

    if not location_ids:
        return {
            "warehouse_id": sim["warehouse_id"],
            "route": [],
            "start": {"x": start_xy[0], "y": start_xy[1]},
            "end": {"x": end_xy[0], "y": end_xy[1]},
            "total_distance": 0.0,
            "estimated_time": 0.0,
            "pick_locations": [],
            "mapped_nodes": [],
            "order_number": order.number,
            "order_id": order.id,
            "order_found": True,
            "order_items": len(items),
            "inventory_locations": 0,
            "mapped_nodes_count": 0,
            "warnings": warnings,
        }

    if not pick_nodes:
        pick_locations = [
            {
                "location_id": lid,
                "location_name": loc_names.get(lid, ""),
                "x": loc_info.get(lid, (0, 0))[0],
                "y": loc_info.get(lid, (0, 0))[1],
                "inventory_location": loc_names.get(lid, ""),
                "inventory_location_coordinates": list(loc_info.get(lid, (0, 0))),
            }
            for lid in location_ids
        ]
        return {
            "warehouse_id": sim["warehouse_id"],
            "route": [],
            "start": {"x": start_xy[0], "y": start_xy[1]},
            "end": {"x": end_xy[0], "y": end_xy[1]},
            "total_distance": 0.0,
            "estimated_time": 0.0,
            "pick_locations": pick_locations,
            "mapped_nodes": [],
            "order_number": order.number,
            "order_id": order.id,
            "order_found": True,
            "order_items": len(items),
            "inventory_locations": len(location_ids),
            "mapped_nodes_count": 0,
            "warnings": warnings,
        }

    route_points = sim.get("route_points") or []
    total_distance_m = sim.get("total_distance_m")
    estimated_time_s = sim.get("estimated_time_s")
    if estimated_time_s is None and isinstance(total_distance_m, (int, float)) and total_distance_m:
        estimated_time_s = round(float(total_distance_m) / WALKING_SPEED_M_S, 1)
    elif estimated_time_s is None:
        estimated_time_s = 0.0

    # Prefer location order from pick_nodes (stable); visit_order middle may use best-AP uuids
    pick_locations = [
        {
            "location_id": p["location_id"],
            "location_name": loc_names.get(p["location_id"], ""),
            "x": loc_info.get(p["location_id"], (0, 0))[0],
            "y": loc_info.get(p["location_id"], (0, 0))[1],
            "inventory_location": loc_names.get(p["location_id"], ""),
            "inventory_location_coordinates": list(loc_info.get(p["location_id"], (0, 0))),
        }
        for p in pick_nodes
    ]
    route = [
        {
            "node_id": p.get("node_uuid") or p.get("node_id"),
            "node_uuid": p.get("node_uuid") or p.get("node_id"),
            "x": p["x"],
            "y": p["y"],
        }
        for p in route_points
    ]
    mapped_nodes = [
        {
            "node_id": p.get("node_uuid") or p["node_id"],
            "node_uuid": p.get("node_uuid") or p["node_id"],
            "x": p["x"],
            "y": p["y"],
            "location_id": p["location_id"],
        }
        for p in pick_nodes
    ]

    logger.info(
        "pick_route: order_number=%s order_id=%s number_of_picks=%s total_distance=%s",
        order.number,
        order.id,
        len(pick_nodes),
        total_distance_m,
    )
    return {
        "warehouse_id": sim["warehouse_id"],
        "route": route,
        "start": {"x": start_xy[0], "y": start_xy[1]},
        "end": {"x": end_xy[0], "y": end_xy[1]},
        "pick_locations": pick_locations,
        "mapped_nodes": mapped_nodes,
        "total_distance": round(total_distance_m, 2) if total_distance_m is not None else None,
        "estimated_time": estimated_time_s,
        "distance_available": sim.get("distance_available", total_distance_m is not None),
        "routing_status": sim.get("routing_status"),
        "order_number": order.number,
        "order_id": order.id,
        "order_found": True,
        "order_items": len(items),
        "inventory_locations": len(location_ids),
        "mapped_nodes_count": len(mapped_nodes),
        "warnings": warnings,
    }


def get_pick_route_batch(db: Session, warehouse_id: int, order_ids: list[int], record_picks: bool = False) -> dict[str, Any]:
    """
    Batch pick route simulation for multiple orders. Uses unified simulation engine (simulate_batch_orders).
    If record_picks=True, creates Pick records (no inventory change) per order for analytics.
    Returns { orders_count, total_distance, estimated_time, routes: [{ order_id, distance, estimated_time, route: [{x,y}, ...] }] }.
    Only processes orders that belong to the given warehouse_id.
    """
    if not order_ids:
        return {"orders_count": 0, "total_distance": 0.0, "estimated_time": 0.0, "routes": []}

    batch = simulate_batch_orders(db, order_ids, warehouse_id, record_picks=record_picks)
    routes_out = batch.get("routes") or []
    # API uses "estimated_time" key; simulation returns "total_estimated_time"
    total_time = batch.get("total_estimated_time") or 0.0
    return {
        "orders_count": batch.get("orders_count") or 0,
        "total_distance": batch.get("total_distance") or 0.0,
        "estimated_time": round(total_time, 1),
        "routes": routes_out,
    }


def get_daily_order_volume(db: Session, warehouse_id: int, days: int = 60) -> list[dict[str, Any]]:
    """
    Orders grouped by day for the warehouse. Uses order_date; fallback to created_at if NULL.
    Returns list of {"date": "YYYY-MM-DD", "orders": count} ordered by date.
    """
    since = datetime.utcnow() - timedelta(days=days)
    # Use COALESCE(order_date, created_at) for date
    day_col = func.date(func.coalesce(Order.order_date, Order.created_at))
    rows = (
        db.query(day_col.label("day"), func.count(Order.id).label("orders"))
        .filter(
            Order.warehouse_id == warehouse_id,
            func.coalesce(Order.order_date, Order.created_at) >= since,
        )
        .group_by(day_col)
        .order_by(day_col)
        .all()
    )
    return [{"date": str(r.day), "orders": int(r.orders)} for r in rows if r.day]


def calculate_sales_forecast(db: Session, warehouse_id: int) -> dict[str, Any]:
    """
    Load last 30 days of order counts, compute 7-day moving average, predict next 7 days.
    Returns {"history": [{"date", "orders"}], "forecast": [{"date", "predicted_orders"}]}.
    """
    history = get_daily_order_volume(db, warehouse_id, days=30)
    orders_count = sum(h["orders"] for h in history)
    days_detected = len(history)
    logger.info(
        "sales_forecast: warehouse_id=%s orders_count=%s days_detected=%s",
        warehouse_id, orders_count, days_detected,
    )
    if days_detected < 7:
        return {
            "history": history,
            "forecast": [],
            "message": "Not enough historical data for forecast.",
        }
    # Build daily series for last 30 days (fill missing days with 0)
    end_date = date.today()
    start_date = end_date - timedelta(days=29)
    day_to_orders: dict[str, int] = {h["date"]: h["orders"] for h in history}
    series: list[tuple[str, int]] = []
    d = start_date
    while d <= end_date:
        key = d.isoformat()
        series.append((key, day_to_orders.get(key, 0)))
        d += timedelta(days=1)
    # 7-day moving average (trailing)
    window = 7
    moving_avg: list[float] = []
    for i in range(len(series)):
        if i + 1 < window:
            moving_avg.append(float(series[i][1]))
        else:
            moving_avg.append(sum(series[j][1] for j in range(i - window + 1, i + 1)) / window)
    # Predict next 7 days: use last moving average as constant forecast
    last_avg = moving_avg[-1] if moving_avg else 0.0
    forecast_start = end_date + timedelta(days=1)
    forecast = [
        {"date": (forecast_start + timedelta(days=i)).isoformat(), "predicted_orders": round(last_avg, 1)}
        for i in range(7)
    ]
    return {
        "history": [{"date": s[0], "orders": s[1]} for s in series],
        "forecast": forecast,
    }
