"""
Professional warehouse slotting analysis.

Uses: products, order_items, inventory, locations.
Metrics: velocity, cube, COI, ABC classification, distance to packing, slotting score, recommended zone.
Only products with inventory; logic contained in this service.
"""

from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.product import Product
from ..models.inventory import Inventory
from ..models.location import Location
from ..models.warehouse import Warehouse
from ..domain.layout_geometry import get_special_locations_xy, distance_point_to_point_cm


def _product_ids_for_filters(
    db: Session,
    tenant_id: int | None,
    name: str | None,
    ean: str | None,
    sku: str | None,
) -> list[int] | None:
    """If any filter is set, return list of product ids matching Product filters; else None."""
    if not (name and name.strip()) and not (ean and ean.strip()) and not (sku and sku.strip()):
        return None
    q = db.query(Product.id)
    if tenant_id is not None:
        q = q.filter(Product.tenant_id == tenant_id)
    if name and name.strip():
        q = q.filter(Product.name.ilike(f"%{name.strip()}%"))
    if ean and ean.strip():
        q = q.filter(Product.ean == ean.strip())
    if sku and sku.strip():
        q = q.filter((Product.sku == sku.strip()) | (Product.symbol == sku.strip()))
    return [r.id for r in q.all()]

# ABC bands: A = top 20%, B = next 30%, C = remaining 50%
ABC_A_PCT = 0.20
ABC_B_PCT = 0.30
ABC_C_PCT = 0.50

# Recommended zones by ABC class
ZONE_BY_ABC = {"A": "PICK_FACE", "B": "MID_ZONE", "C": "RESERVE"}


def get_slotting_analysis(
    db: Session,
    warehouse_id: int,
    limit: int | None = None,
    name: str | None = None,
    ean: str | None = None,
    sku: str | None = None,
    tenant_id: int | None = None,
) -> dict[str, Any]:
    """
    Professional slotting: velocity, cube, COI, ABC class, distance to packing,
    slotting_score, current_location, recommended_zone.
    Only products with inventory; sorted by slotting_score DESC.
    Optional product filters (name, ean, sku) applied on products table before calculations.
    Returns { products: [...], packing_location }.
    """
    # Resolve tenant for product filter (use warehouse.tenant_id if not provided)
    effective_tenant_id = tenant_id
    if effective_tenant_id is None:
        wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
        if wh is not None:
            effective_tenant_id = wh.tenant_id

    product_id_filter = _product_ids_for_filters(db, effective_tenant_id, name, ean, sku)
    if product_id_filter is not None and len(product_id_filter) == 0:
        _, pack_xy = get_special_locations_xy(db, warehouse_id)
        pl = {"x": pack_xy[0], "y": pack_xy[1]} if pack_xy else None
        return {"packing_location": pl, "products": []}

    # PACKING location (simulation engine, coordinates in cm)
    _, pack_xy = get_special_locations_xy(db, warehouse_id)
    packing_x = pack_xy[0] if pack_xy else None
    packing_y = pack_xy[1] if pack_xy else None
    packing_location = {"x": packing_x, "y": packing_y} if pack_xy else None

    # 1. Velocity = SUM(order_items.quantity) per product for this warehouse
    velocity_q = (
        db.query(OrderItem.product_id, func.sum(OrderItem.quantity).label("velocity"))
        .join(Order, OrderItem.order_id == Order.id)
        .filter(Order.warehouse_id == warehouse_id)
        .group_by(OrderItem.product_id)
    )
    if product_id_filter is not None:
        velocity_q = velocity_q.filter(OrderItem.product_id.in_(product_id_filter))
    velocity_rows = velocity_q.all()
    velocity_by_product = {r.product_id: float(r.velocity or 0) for r in velocity_rows}

    # 2–3. Product + inventory + location: one row per product (first location if multiple)
    inv_loc_q = (
        db.query(
            Inventory.product_id,
            Product.name.label("product_name"),
            Product.symbol,
            Product.length,
            Product.width,
            Product.height,
            Location.id.label("location_id"),
            Location.name.label("location_name"),
            Location.x,
            Location.y,
        )
        .join(Product, Inventory.product_id == Product.id)
        .join(Location, Inventory.location_id == Location.id)
        .filter(
            Inventory.warehouse_id == warehouse_id,
            Inventory.quantity > 0,
        )
    )
    if product_id_filter is not None:
        inv_loc_q = inv_loc_q.filter(Product.id.in_(product_id_filter))
    inv_loc_rows = inv_loc_q.all()
    seen_products: set[int] = set()
    inv_loc_unique: list[Any] = []
    for r in inv_loc_rows:
        if r.product_id in seen_products:
            continue
        seen_products.add(r.product_id)
        inv_loc_unique.append(r)

    if not inv_loc_unique:
        return {"packing_location": packing_location, "products": []}

    # 4. ABC: sort products with inventory by velocity DESC, assign A=20%, B=30%, C=50%
    product_ids_ordered = sorted(
        [r.product_id for r in inv_loc_unique],
        key=lambda pid: -velocity_by_product.get(pid, 0.0),
    )
    n = len(product_ids_ordered)
    n_a = max(0, int(round(n * ABC_A_PCT)))
    n_b = max(0, int(round(n * ABC_B_PCT)))
    abc_by_product: dict[int, str] = {}
    for i, pid in enumerate(product_ids_ordered):
        if i < n_a:
            abc_by_product[pid] = "A"
        elif i < n_a + n_b:
            abc_by_product[pid] = "B"
        else:
            abc_by_product[pid] = "C"

    # Build result rows: cube, COI, distance, slotting_score, recommended_zone
    results = []
    for r in inv_loc_unique:
        pid = r.product_id
        velocity = velocity_by_product.get(pid, 0.0)
        length = float(r.length or 0)
        width = float(r.width or 0)
        height = float(r.height or 0)
        cube = length * width * height
        if velocity > 0:
            coi = cube / velocity
        else:
            coi = None  # avoid division by zero
        abc_class = abc_by_product.get(pid, "C")
        recommended_zone = ZONE_BY_ABC.get(abc_class, "RESERVE")

        loc_x = float(r.x or 0)
        loc_y = float(r.y or 0)
        if packing_x is not None and packing_y is not None:
            distance_to_packing = distance_point_to_point_cm(loc_x, loc_y, packing_x, packing_y)
        else:
            distance_to_packing = 0.0
        slotting_score = velocity / (distance_to_packing + 1.0)

        results.append({
            "product_id": pid,
            "product_name": (r.product_name or "").strip() or None,
            "symbol": (r.symbol or "").strip() or None,
            "velocity": round(velocity, 2),
            "cube": round(cube, 4),
            "coi": round(coi, 6) if coi is not None else None,
            "abc_class": abc_class,
            "distance_to_packing": round(distance_to_packing, 2),
            "slotting_score": round(slotting_score, 6),
            "current_location": (r.location_name or "").strip() or None,
            "recommended_zone": recommended_zone,
            "location_id": r.location_id,
            "location_x": round(loc_x, 2),
            "location_y": round(loc_y, 2),
        })

    results.sort(key=lambda x: (-x["slotting_score"], -x["velocity"]))
    if limit is not None:
        results = results[:limit]

    return {
        "packing_location": packing_location,
        "products": results,
    }
