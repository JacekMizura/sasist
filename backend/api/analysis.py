"""
Analysis API

Endpoints: CSV run (POST) + order-based analytics (GET).
Analytics use only: orders, order_items, products, inventory.
"""

from datetime import datetime, date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.order import Order
from ..models.order_item import OrderItem
from ..services.analysis_service import AnalysisService
from ..services.analytics_service import (
    product_rotation,
    hot_products,
    dead_stock,
    dead_stock_space,
    pick_density,
    product_pairs,
    hot_locations,
    picking_analysis_summary,
    picking_analysis_list,
    picking_heatmap,
    generate_simulated_picks,
    delete_simulated_picks,
    batch_picking,
    walking_cost,
    get_pick_route,
    get_pick_route_batch,
)
from ..services.sales_forecast_service import get_warehouse_forecast, calculate_product_forecast
from ..services.slotting_service import get_slotting_analysis
from ..domain.picking_simulation import run_strategy_simulation

router = APIRouter(prefix="/analysis", tags=["Analysis"])


@router.post("/run")
def run_analysis(
    orders_file: UploadFile = File(...),
    products_file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Przyjmuje dwa pliki CSV: orders_file, products_file.
    """
    service = AnalysisService(db)
    return service.run_analysis(
        orders_file=orders_file,
        products_file=products_file,
    )


PRODUCT_LIMIT_CHOICES = [10, 25, 50, 100, 500]


@router.get("/product-rotation")
def get_product_rotation(
    tenant_id: int = Query(1, description="Tenant ID"),
    name: Optional[str] = Query(None, description="Filter by product name (LIKE)"),
    ean: Optional[str] = Query(None, description="Filter by product EAN"),
    sku: Optional[str] = Query(None, description="Filter by product SKU"),
    limit: int = Query(25, description="Max rows (10, 25, 50, 100, 500)"),
    db: Session = Depends(get_db),
):
    """Total quantity sold per product (from order_items). Optional product filters and limit."""
    if limit not in PRODUCT_LIMIT_CHOICES:
        limit = 25
    return product_rotation(
        db,
        tenant_id,
        name=(name.strip() or None) if name else None,
        ean=(ean.strip() or None) if ean else None,
        sku=(sku.strip() or None) if sku else None,
        limit=limit,
    )


@router.get("/hot-products")
def get_hot_products(
    tenant_id: int = Query(1, description="Tenant ID"),
    name: Optional[str] = Query(None, description="Filter by product name (LIKE)"),
    ean: Optional[str] = Query(None, description="Filter by product EAN"),
    sku: Optional[str] = Query(None, description="Filter by product SKU"),
    limit: int = Query(25, description="Max rows (10, 25, 50, 100, 500)"),
    db: Session = Depends(get_db),
):
    """Top products by quantity ordered. Optional product filters and limit."""
    if limit not in PRODUCT_LIMIT_CHOICES:
        limit = 25
    return hot_products(
        db,
        tenant_id,
        limit=limit,
        name=(name.strip() or None) if name else None,
        ean=(ean.strip() or None) if ean else None,
        sku=(sku.strip() or None) if sku else None,
    )


DEAD_STOCK_LIMIT_CHOICES = [10, 25, 50, 100, 500]


@router.get("/dead-stock")
def get_dead_stock(
    tenant_id: int = Query(1, description="Tenant ID"),
    days: int = Query(90, ge=1, le=365, description="Days without sales (used for backward compat when never sold)"),
    name: Optional[str] = Query(None, description="Filter by product name (LIKE)"),
    ean: Optional[str] = Query(None, description="Filter by product EAN"),
    sku: Optional[str] = Query(None, description="Filter by product SKU"),
    sales_start_date: Optional[str] = Query(None, description="Sales window start (YYYY-MM-DD)"),
    sales_end_date: Optional[str] = Query(None, description="Sales window end (YYYY-MM-DD)"),
    limit: int = Query(25, description="Max rows to return"),
    db: Session = Depends(get_db),
):
    """
    Inventory aging: products with inventory > 0, with last_sale_date, days_since_last_sale,
    inventory_value, sales_last_30/90_days, rotation_rate, category (FAST_MOVING/SLOW_MOVING/DEAD_STOCK).
    Optional filters: name (LIKE), ean, sku; sales_start_date/sales_end_date restrict which orders count.
    Limit: 10, 25, 50, 100, 500 (default 25).
    """
    if limit not in DEAD_STOCK_LIMIT_CHOICES:
        limit = 25
    start_d = _parse_date(sales_start_date) if sales_start_date else None
    end_d = _parse_date(sales_end_date) if sales_end_date else None
    return dead_stock(
        db,
        tenant_id,
        days=days,
        name=(name.strip() or None) if name else None,
        ean=(ean.strip() or None) if ean else None,
        sku=(sku.strip() or None) if sku else None,
        sales_start_date=start_d,
        sales_end_date=end_d,
        limit=limit,
    )


@router.get("/dead-stock-space")
def get_dead_stock_space(
    warehouse_id: int = Query(..., description="Warehouse ID"),
    tenant_id: int = Query(..., description="Tenant ID"),
    limit: int = Query(50, ge=1, le=200, description="Max number of top products by occupied volume"),
    db: Session = Depends(get_db),
):
    """
    Dead stock space usage: physical warehouse space (dm³) occupied by fast/slow/dead stock.
    Returns totals (total_volume, fast/slow/dead_volume and percentages) and top N products by occupied_volume.
    """
    return dead_stock_space(db, warehouse_id=warehouse_id, tenant_id=tenant_id, limit=limit)


@router.get("/pick-density")
def get_pick_density(
    tenant_id: int = Query(..., description="Tenant ID"),
    warehouse_id: int | None = Query(None, description="Optional warehouse filter"),
    db: Session = Depends(get_db),
):
    """Order quantity grouped by location (via product's inventory). Uses order_items + inventory."""
    return pick_density(db, tenant_id, warehouse_id=warehouse_id)


@router.get("/product-pairs")
def get_product_pairs(
    tenant_id: int = Query(..., description="Tenant ID"),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """Products bought together (same order). Uses order_items only."""
    return product_pairs(db, tenant_id, limit=limit)


@router.get("/hot-locations")
def get_hot_locations(
    tenant_id: int = Query(..., description="Tenant ID"),
    warehouse_id: int | None = Query(None, description="Optional warehouse filter"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """Hot locations from picks: SUM(picked quantity) per location; includes current_stock from inventory."""
    return hot_locations(db, tenant_id, warehouse_id=warehouse_id, limit=limit)


@router.get("/picking-analysis/summary")
def get_picking_analysis_summary(
    tenant_id: int = Query(..., description="Tenant ID"),
    warehouse_id: int | None = Query(None, description="Optional warehouse filter"),
    db: Session = Depends(get_db),
):
    """Summary metrics from picks: total_picks, total_picked_quantity, avg_picks_per_order, avg_locations_per_order."""
    return picking_analysis_summary(db, tenant_id, warehouse_id=warehouse_id)


@router.get("/picking-analysis/picks")
def get_picking_analysis_picks(
    tenant_id: int = Query(..., description="Tenant ID"),
    warehouse_id: int | None = Query(None, description="Optional warehouse filter"),
    product_name: Optional[str] = Query(None),
    sku: Optional[str] = Query(None),
    ean: Optional[str] = Query(None),
    location: Optional[str] = Query(None, description="Location name (LIKE)"),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    limit: int = Query(500, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    """List picks with order_id, product name, SKU, location, quantity, picked_at. Filters: product_name, sku, ean, location, date_from, date_to."""
    date_from_parsed = date.fromisoformat(date_from) if date_from and date_from.strip() else None
    date_to_parsed = date.fromisoformat(date_to) if date_to and date_to.strip() else None
    return picking_analysis_list(
        db,
        tenant_id,
        warehouse_id=warehouse_id,
        product_name=product_name.strip() or None if product_name else None,
        sku=sku.strip() or None if sku else None,
        ean=ean.strip() or None if ean else None,
        location_name=location.strip() or None if location else None,
        date_from=date_from_parsed,
        date_to=date_to_parsed,
        limit=limit,
    )


@router.get("/picking-analysis/heatmap")
def get_picking_analysis_heatmap(
    tenant_id: int = Query(..., description="Tenant ID"),
    warehouse_id: int | None = Query(None, description="Optional warehouse filter"),
    db: Session = Depends(get_db),
):
    """Per-location pick stats for heatmap: location_id, location_name, x, y, total_picks, total_quantity, unique_orders, products_picked."""
    return picking_heatmap(db, tenant_id, warehouse_id=warehouse_id)


@router.post("/picking-analysis/generate-simulated-picks")
def post_generate_simulated_picks(
    tenant_id: int = Query(..., description="Tenant ID"),
    warehouse_id: int = Query(..., description="Warehouse ID"),
    replace_existing: bool = Query(True, description="If true, delete existing picks for this warehouse first"),
    db: Session = Depends(get_db),
):
    """
    Generate simulated Pick records from orders and inventory (no inventory change).
    Loads orders for the warehouse; for each order_item allocates quantity across inventory
    locations (ordered by pick_sequence) and creates Pick records. Refreshes analytics data.
    """
    return generate_simulated_picks(db, tenant_id, warehouse_id, replace_existing=replace_existing)


@router.delete("/picking-analysis/picks")
def delete_picking_analysis_picks(
    tenant_id: int = Query(..., description="Tenant ID"),
    warehouse_id: int = Query(..., description="Warehouse ID"),
    db: Session = Depends(get_db),
):
    """Delete all picks for the given tenant and warehouse (clear simulated picks data)."""
    return delete_simulated_picks(db, tenant_id, warehouse_id)


@router.get("/batch-picking")
def get_batch_picking(
    tenant_id: int = Query(1, description="Tenant ID"),
    name: Optional[str] = Query(None, description="Filter by product name (LIKE)"),
    ean: Optional[str] = Query(None, description="Filter by product EAN"),
    sku: Optional[str] = Query(None, description="Filter by product SKU"),
    limit: int = Query(25, description="Max rows (10, 25, 50, 100, 500)"),
    db: Session = Depends(get_db),
):
    """Total picks per product from order_items. Optional product filters and limit."""
    if limit not in PRODUCT_LIMIT_CHOICES:
        limit = 25
    return batch_picking(
        db,
        tenant_id,
        limit=limit,
        name=(name.strip() or None) if name else None,
        ean=(ean.strip() or None) if ean else None,
        sku=(sku.strip() or None) if sku else None,
    )


@router.get("/walking-cost")
def get_walking_cost(
    tenant_id: int = Query(..., description="Tenant ID"),
    warehouse_id: int | None = Query(None, description="Optional warehouse filter"),
    db: Session = Depends(get_db),
):
    """Estimated travel per order (distinct locations, total items) from order_items + inventory. No picks."""
    return walking_cost(db, tenant_id, warehouse_id=warehouse_id)


@router.get("/sales-forecast/{warehouse_id}")
def get_sales_forecast(warehouse_id: int, db: Session = Depends(get_db)):
    """
    Warehouse-level forecast: last 90 days history (orders + items), weekday seasonality,
    14-day moving average base, next 14 days forecast. Returns { history, forecast, message? }.
    """
    return get_warehouse_forecast(db, warehouse_id)


@router.get("/product-forecast/{product_id}")
def get_product_forecast(product_id: int, db: Session = Depends(get_db)):
    """
    Product-level forecast: last 90 days quantity per day, 14-day MA + weekday multipliers,
    next 14 days forecast. Returns { product_id, history, forecast, message? }.
    """
    return calculate_product_forecast(db, product_id)


class PickRouteBatchBody(BaseModel):
    warehouse_id: int
    order_ids: List[int]
    record_picks: Optional[bool] = False


class BatchPickRequest(BaseModel):
    tenant_id: int
    warehouse_id: int
    order_numbers: List[str]


@router.post("/pick-route/batch/")
def simulate_batch_pick_route(payload: BatchPickRequest, db: Session = Depends(get_db)):
    """
    Batch pick route simulation: load orders by external order numbers.
    Returns debug: orders_found, order_items, order_numbers.
    """
    orders = (
        db.query(Order)
        .filter(
            Order.number.in_(payload.order_numbers),
            Order.tenant_id == payload.tenant_id,
            Order.warehouse_id == payload.warehouse_id,
        )
        .all()
    )
    order_ids = [o.id for o in orders]
    items = (
        db.query(OrderItem)
        .filter(OrderItem.order_id.in_(order_ids))
        .all()
    )
    return {
        "orders_found": len(orders),
        "order_items": len(items),
        "order_numbers": payload.order_numbers,
    }


@router.get("/slotting/{warehouse_id}")
def get_slotting(
    warehouse_id: int,
    tenant_id: int | None = Query(None, description="Optional tenant for product filters"),
    name: str | None = Query(None, description="Filter by product name (LIKE)"),
    ean: str | None = Query(None, description="Filter by product EAN"),
    sku: str | None = Query(None, description="Filter by product SKU"),
    limit: int | None = Query(None, ge=1, le=2000, description="Optional max products to return (default: all)"),
    db: Session = Depends(get_db),
):
    """
    Professional slotting analysis for a warehouse.
    Data: products, order_items, inventory, locations.
    Optional filters: name (LIKE), ean, sku applied on products before slotting.
    Metrics: velocity, cube, COI, ABC class, distance to packing, slotting_score, recommended_zone.
    Only products with inventory; sorted by slotting_score DESC.
    Response: { products: [...], packing_location }.
    """
    name = (name or "").strip() or None
    ean = (ean or "").strip() or None
    sku = (sku or "").strip() or None
    return get_slotting_analysis(
        db,
        warehouse_id=warehouse_id,
        limit=limit,
        name=name,
        ean=ean,
        sku=sku,
        tenant_id=tenant_id,
    )


@router.get("/pick-route/{order_number:path}")
def get_pick_route_endpoint(
    order_number: str,
    record_picks: bool = Query(False, description="If true, create Pick records for analytics (no inventory change)"),
    db: Session = Depends(get_db),
):
    """
    Shortest walking route for picking an order by external order number (nearest-neighbor on warehouse graph).
    Uses orders.number (e.g. from CSV import). Returns { route, total_distance, estimated_time, pick_locations, order_number, order_id, order_found }.
    Optional record_picks: create Pick events for Hot locations / Walking cost / Slotting (simulation only, no inventory change).
    """
    return get_pick_route(db, order_number, record_picks=record_picks)


@router.post("/pick-route/batch")
def post_pick_route_batch(body: PickRouteBatchBody, db: Session = Depends(get_db)):
    """
    Batch pick route simulation for multiple orders. Request: { warehouse_id, order_ids, record_picks? }.
    If record_picks=true, creates Pick records for analytics (no inventory change).
    Returns { orders_count, total_distance, estimated_time, routes: [{ order_id, distance, estimated_time, route: [{x,y}, ...] }] }.
    """
    return get_pick_route_batch(
        db, warehouse_id=body.warehouse_id, order_ids=body.order_ids, record_picks=body.record_picks or False
    )


def _parse_date(value: Optional[str]) -> Optional[date]:
    """Parse YYYY-MM-DD string to date, or None if invalid/missing."""
    if not value:
        return None
    try:
        return date.fromisoformat(value.strip())
    except (ValueError, AttributeError):
        return None


@router.get("/picking-strategy/{warehouse_id}")
def get_picking_strategy_analysis(
    warehouse_id: int,
    tenant_id: int = Query(1, description="Tenant ID"),
    limit: int = Query(100, ge=1, le=500, description="Number of recent orders when no date range"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD) for order filter"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD) for order filter"),
    db: Session = Depends(get_db),
):
    """
    Simulate Cart, Basket, Zone, and Hybrid picking strategies.
    Order selection: if start_date and end_date are provided, use orders with order_date in that range;
    otherwise use the most recent orders (limit).
    Returns metrics per strategy plus dataset stats: orders_used, total_items, avg_items_per_order.
    """
    start_d = _parse_date(start_date)
    end_d = _parse_date(end_date)
    use_date_range = start_d is not None and end_d is not None and start_d <= end_d

    query = (
        db.query(Order.id)
        .filter(
            Order.tenant_id == tenant_id,
            Order.warehouse_id == warehouse_id,
        )
    )
    if use_date_range:
        start_dt = datetime.combine(start_d, datetime.min.time())
        end_dt = datetime.combine(end_d, datetime.max.time())
        query = query.filter(
            Order.order_date >= start_dt,
            Order.order_date <= end_dt,
        )
        query = query.order_by(Order.order_date.asc(), Order.id.asc())
        orders = query.all()
    else:
        orders = query.order_by(Order.id.desc()).limit(limit).all()

    order_ids = [o.id for o in orders]
    if not order_ids:
        return {
            "strategies": [],
            "orders_used": 0,
            "total_items": 0,
            "avg_items_per_order": 0.0,
        }
    from sqlalchemy import func
    total_items = (
        db.query(func.coalesce(func.sum(OrderItem.quantity), 0))
        .filter(OrderItem.order_id.in_(order_ids))
        .scalar()
    )
    if total_items is None:
        total_items = 0
    total_items = int(total_items)
    avg_items = round(total_items / len(order_ids), 2) if order_ids else 0.0

    results = run_strategy_simulation(db, tenant_id=tenant_id, warehouse_id=warehouse_id, order_ids=order_ids)
    return {
        "strategies": [r.to_dict() for r in results],
        "orders_used": len(order_ids),
        "total_items": total_items,
        "avg_items_per_order": avg_items,
    }
