"""
API: Orders

Endpointy do pobierania zamówień.
Lista zwraca total_volume (suma L×W×H/1000 po pozycjach), is_multi_item, total_items.
Obsługa filtrów status/order_type oraz paginacji limit/offset.
"""

import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.product import Product
from ..schemas.order import OrderRead, OrderListRead, OrderItemRead, ProductInOrder

router = APIRouter(
    prefix="/orders",
    tags=["Orders"]
)
logger = logging.getLogger(__name__)

FALLBACK_VOLUME_DM3 = 0.001


def _unit_volume_dm3(product: Product) -> float:
    """Objętość jednej sztuki w dm³: product.volume lub (L×W×H)/1000."""
    if product.volume is not None and product.volume > 0:
        return float(product.volume)
    l_, w_, h_ = product.length or 0, product.width or 0, product.height or 0
    if l_ and w_ and h_:
        return (l_ * w_ * h_) / 1000.0
    return FALLBACK_VOLUME_DM3


def _order_total_volume_and_multi(order: Order) -> tuple[float, bool, int, int]:
    """
    total_volume (dm³) = suma (L×W×H/1000) * quantity po pozycjach,
    is_multi_item = True tylko gdy liczba unikalnych EAN/SKU > 1 (2+ różnych produktów).
    Single-item = 1 unikalny SKU (np. 10× ten sam produkt),
    Multi-item = 2+ różnych SKU.
    total_items = suma quantity (sztuk),
    position_count = liczba pozycji (unikalnych SKU).
    """
    total_volume = 0.0
    total_qty = 0
    for item in order.items:
        product = item.product
        qty = item.quantity or 0
        if qty <= 0:
            continue
        vol = _unit_volume_dm3(product) if product else FALLBACK_VOLUME_DM3
        total_volume += vol * qty
        total_qty += qty
    position_count = len(order.items)
    is_multi = position_count > 1
    return round(total_volume, 4), is_multi, total_qty, position_count


# ==========================================================
# GET LIST
# ==========================================================

@router.get("/", response_model=List[OrderListRead])
def get_orders(
    response: Response,
    tenant_id: Optional[int] = Query(None, description="Filter by tenant; if omitted, no tenant filter"),
    warehouse_id: Optional[int] = Query(None, description="Filter by warehouse; if omitted, no warehouse filter"),
    db: Session = Depends(get_db),
    status: Optional[str] = None,
    order_type: Optional[str] = None,
    order_id: Optional[str] = None,
    volume_min: Optional[float] = None,
    volume_max: Optional[float] = None,
    sort_by: Optional[str] = None,
    sort_dir: Optional[str] = None,
    sort_direction: Optional[str] = None,
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    search: Optional[str] = Query(None, description="Search by order number, product name, or SKU"),
):
    """
    Zamówienia z total_volume (dm³), is_multi_item, total_items.
    Filtry: tenant_id, warehouse_id (opcjonalne – bez nich zwracane są wszystkie zamówienia), status, order_type, volume_min, volume_max.
    Sortowanie: sort_by (id|status|total_volume|total_items), sort_dir lub sort_direction (asc|desc).
    """
    logger.info("ORDERS QUERY tenant_id=%s warehouse_id=%s", tenant_id, warehouse_id)
    # DB debug: total count and last 10 orders
    try:
        total_in_db = db.query(func.count(Order.id)).scalar() or 0
        sample = (
            db.query(Order.id, Order.tenant_id, Order.warehouse_id, Order.number)
            .order_by(Order.id.desc())
            .limit(10)
            .all()
        )
        logger.info("ORDERS DB: total count=%s, sample (id, tenant_id, warehouse_id, number)=%s", total_in_db, [(r.id, r.tenant_id, r.warehouse_id, r.number) for r in sample])
    except Exception as e:
        logger.warning("ORDERS DB debug query failed: %s", e)

    q = (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product),
        )
    )
    if tenant_id is not None:
        q = q.filter(Order.tenant_id == tenant_id)
    if warehouse_id is not None:
        q = q.filter(Order.warehouse_id == warehouse_id)
    if status and status.strip():
        q = q.filter(Order.status == status.strip())
    if order_id and order_id.strip():
        oid = order_id.strip()
        if oid.isdigit():
            q = q.filter(Order.id == int(oid))
        else:
            q = q.filter(Order.number.ilike(f"%{oid}%"))
    if search and search.strip():
        term = search.strip()
        from sqlalchemy import or_
        # Filter: order number / id OR any order_item's product name or SKU/symbol
        q = q.outerjoin(OrderItem, Order.id == OrderItem.order_id).outerjoin(
            Product, OrderItem.product_id == Product.id
        )
        if term.isdigit():
            q = q.filter(
                or_(
                    Order.id == int(term),
                    Order.number.ilike(f"%{term}%"),
                    Product.name.ilike(f"%{term}%"),
                    Product.sku.ilike(f"%{term}%"),
                    Product.symbol.ilike(f"%{term}%"),
                )
            )
        else:
            q = q.filter(
                or_(
                    Order.number.ilike(f"%{term}%"),
                    Product.name.ilike(f"%{term}%"),
                    Product.sku.ilike(f"%{term}%"),
                    Product.symbol.ilike(f"%{term}%"),
                )
            )
        q = q.distinct()
    orders = q.all()

    built = []
    for o in orders:
        total_volume, is_multi_item, total_items, position_count = _order_total_volume_and_multi(o)
        built.append((o, total_volume, is_multi_item, total_items, position_count))

    if order_type and order_type.strip():
        ot = order_type.strip().lower()
        built = [(o, tv, im, ti, pc) for o, tv, im, ti, pc in built if (im is True) == (ot == "multi")]

    if volume_min is not None:
        built = [(o, tv, im, ti, pc) for o, tv, im, ti, pc in built if tv >= volume_min]
    if volume_max is not None:
        built = [(o, tv, im, ti, pc) for o, tv, im, ti, pc in built if tv <= volume_max]

    sort_d = sort_dir or sort_direction
    if sort_by and sort_by in ("id", "number", "status", "total_volume", "total_items", "order_type", "position_count"):
        reverse = (sort_d or "asc").lower() == "desc"
        if sort_by == "id":
            built.sort(key=lambda x: x[0].id, reverse=reverse)
        elif sort_by == "number":
            built.sort(key=lambda x: (x[0].number or ""), reverse=reverse)
        elif sort_by == "status":
            built.sort(key=lambda x: (x[0].status or ""), reverse=reverse)
        elif sort_by == "total_volume":
            built.sort(key=lambda x: x[1], reverse=reverse)
        elif sort_by == "total_items":
            built.sort(key=lambda x: x[3], reverse=reverse)
        elif sort_by == "order_type":
            built.sort(key=lambda x: x[2], reverse=reverse)
        elif sort_by == "position_count":
            built.sort(key=lambda x: x[4], reverse=reverse)

    total_count = len(built)
    if offset is not None and offset > 0:
        built = built[offset:]
    if limit is not None and limit > 0:
        built = built[:limit]

    result = [
        OrderListRead(
            id=o.id,
            number=o.number,
            city=o.city,
            country=o.country,
            status=o.status,
            order_date=o.order_date,
            value=o.value,
            created_at=o.created_at,
            source=o.source,
            shipping_method=o.shipping_method,
            currency=o.currency,
            total_volume=total_volume,
            is_multi_item=is_multi_item,
            total_items=total_items,
            position_count=position_count,
        )
        for o, total_volume, is_multi_item, total_items, position_count in built
    ]
    if limit is not None or offset is not None:
        response.headers["X-Total-Count"] = str(total_count)
    logger.info("ORDERS LIST: returned %s orders (tenant_id=%s warehouse_id=%s)", len(result), tenant_id, warehouse_id)
    return result


# Debug: raw DB check (call GET /orders/debug/db to verify orders table)
@router.get("/debug/db")
def orders_debug_db(db: Session = Depends(get_db)):
    """Returns total count and last 10 orders (id, tenant_id, warehouse_id, number) for debugging."""
    total = db.query(func.count(Order.id)).scalar() or 0
    rows = (
        db.query(Order.id, Order.tenant_id, Order.warehouse_id, Order.number)
        .order_by(Order.id.desc())
        .limit(10)
        .all()
    )
    return {
        "total_count": total,
        "sample": [{"id": r.id, "tenant_id": r.tenant_id, "warehouse_id": r.warehouse_id, "number": r.number} for r in rows],
    }


@router.delete("/bulk")
def bulk_delete_orders(
    tenant_id: int,
    warehouse_id: int,
    ids: str,
    db: Session = Depends(get_db),
):
    """Usuwa wiele zamówień po ID (ids=1,2,3). Usuwa też powiązane OrderItem."""
    if not ids or not ids.strip():
        return {"deleted": 0}
    id_list = []
    for s in ids.split(","):
        s = s.strip()
        if s.isdigit():
            id_list.append(int(s))
    if not id_list:
        return {"deleted": 0}
    # Usuń najpierw pozycje zamówień
    db.query(OrderItem).filter(OrderItem.order_id.in_(id_list)).delete(synchronize_session=False)
    deleted = db.query(Order).filter(
        Order.tenant_id == tenant_id,
        Order.warehouse_id == warehouse_id,
        Order.id.in_(id_list),
    ).delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}


# ==========================================================
# PENDING STATS (dla dashboardu: NEW orders)
# ==========================================================

@router.get("/pending-stats/")
def get_pending_order_stats(
    tenant_id: int,
    warehouse_id: int,
    db: Session = Depends(get_db),
):
    """
    Statystyki zamówień do realizacji (status NEW):
    orders_to_pick, total_items (suma quantity), total_volume (dm³).
    """
    q = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(
            Order.tenant_id == tenant_id,
            Order.warehouse_id == warehouse_id,
            Order.status == "NEW",
        )
    )
    orders = q.all()
    orders_to_pick = len(orders)
    total_items = 0
    total_volume = 0.0
    for o in orders:
        tv, _, ti, _ = _order_total_volume_and_multi(o)
        total_volume += tv
        total_items += ti
    return {
        "orders_to_pick": orders_to_pick,
        "total_items": total_items,
        "total_volume": round(total_volume, 4),
    }


# ==========================================================
# GET DETAILS (z pozycjami i produktami)
# ==========================================================

@router.get("/{order_id}/", response_model=OrderRead)
def get_order_details(
    order_id: int,
    db: Session = Depends(get_db)
):
    logger.info("ORDERS GET order_id=%s", order_id)
    order = (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product)
        )
        .filter(Order.id == order_id)
        .first()
    )

    if not order:
        logger.warning("ORDERS GET order_id=%s not found", order_id)
        raise HTTPException(status_code=404, detail="Order not found")

    total_volume, is_multi_item, _, _ = _order_total_volume_and_multi(order)
    items_out = []
    for item in order.items:
        product = item.product
        unit_vol = _unit_volume_dm3(product) if product else FALLBACK_VOLUME_DM3
        line_weight = (item.quantity or 0) * (product.weight or 0) if product else None
        items_out.append(OrderItemRead(
            id=item.id,
            quantity=item.quantity,
            product=ProductInOrder.model_validate(product) if product else ProductInOrder(id=0),
            unit_volume_dm3=round(unit_vol, 4),
            line_total_weight=round(line_weight, 4) if line_weight is not None else None,
        ))

    return OrderRead(
        id=order.id,
        number=order.number,
        city=order.city,
        country=order.country,
        status=order.status,
        items=items_out,
        total_volume=total_volume,
        is_multi_item=is_multi_item,
    )