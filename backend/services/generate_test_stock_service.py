"""
Dev utility: generate test warehouse stock (Stock table).

Randomly assigns tenant products to warehouse storage locations with random quantities.
Excludes special locations (PICK_START, PACKING, DOCK, and names like IMPORT, BUFFER).
Respects location capacity (max_volume, max_weight, max_units) if defined.
"""

import random
from sqlalchemy.orm import Session

from ..models.stock import Stock
from ..models.location import Location
from ..models.product import Product

# Location types to exclude (route/special, not storage)
EXCLUDED_LOCATION_TYPES = ("PICK_START", "PACKING", "DOCK")
# Location name substrings to exclude (case-insensitive)
EXCLUDED_LOCATION_NAMES = ("IMPORT", "BUFFER", "PACKING")
MAX_ASSIGNMENT_RETRIES = 100


def _product_volume_dm3(p: Product) -> float:
    if p.volume is not None and p.volume > 0:
        return float(p.volume)
    l_, w_, h_ = p.length or 0, p.width or 0, p.height or 0
    if l_ and w_ and h_:
        return (l_ * w_ * h_) / 1000.0
    return 0.0


def _location_has_capacity_constraint(loc: Location) -> bool:
    return (
        getattr(loc, "max_volume", None) is not None
        or getattr(loc, "max_weight", None) is not None
        or getattr(loc, "max_units", None) is not None
    )


def _location_can_accept(
    location_id: int,
    current_usage: dict,
    add_quantity: float,
    add_volume: float,
    add_weight: float,
    loc: Location,
) -> bool:
    max_vol = getattr(loc, "max_volume", None)
    max_weight = getattr(loc, "max_weight", None)
    max_units = getattr(loc, "max_units", None)
    if max_vol is None and max_weight is None and max_units is None:
        return True
    used = current_usage.get(location_id, {"volume": 0.0, "weight": 0.0, "units": 0.0})
    if max_vol is not None and (used["volume"] + add_volume) > float(max_vol):
        return False
    if max_weight is not None and (used["weight"] + add_weight) > float(max_weight):
        return False
    if max_units is not None and (used["units"] + add_quantity) > float(max_units):
        return False
    return True


def _update_usage(
    current_usage: dict,
    location_id: int,
    quantity: float,
    volume: float,
    weight: float,
) -> None:
    if location_id not in current_usage:
        current_usage[location_id] = {"volume": 0.0, "weight": 0.0, "units": 0.0}
    current_usage[location_id]["volume"] += volume
    current_usage[location_id]["weight"] += weight
    current_usage[location_id]["units"] += quantity


def _is_storage_location(loc: Location) -> bool:
    if loc.location_type in EXCLUDED_LOCATION_TYPES:
        return False
    name_upper = (loc.name or "").upper()
    for excluded in EXCLUDED_LOCATION_NAMES:
        if excluded in name_upper:
            return False
    return True


def generate_test_stock(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    product_limit: int = 200,
    replace_existing: bool = False,
) -> dict:
    """
    Generate test stock: randomly assign tenant products to warehouse storage locations.
    Returns { products_assigned, locations_used, total_stock_rows_created }.
    """
    if replace_existing:
        db.query(Stock).filter(
            Stock.tenant_id == tenant_id,
            Stock.warehouse_id == warehouse_id,
        ).delete(synchronize_session=False)
        db.flush()

    products = (
        db.query(Product)
        .filter(Product.tenant_id == tenant_id)
        .limit(max(1, product_limit))
        .all()
    )
    if not products:
        return {"products_assigned": 0, "locations_used": 0, "total_stock_rows_created": 0}

    all_locations = (
        db.query(Location)
        .filter(
            Location.warehouse_id == warehouse_id,
            ~Location.location_type.in_(EXCLUDED_LOCATION_TYPES),
        )
        .all()
    )
    allowed_locations = [loc for loc in all_locations if _is_storage_location(loc)]
    if not allowed_locations:
        return {"products_assigned": 0, "locations_used": 0, "total_stock_rows_created": 0}

    existing_keys = set()
    if not replace_existing:
        existing = (
            db.query(Stock.tenant_id, Stock.product_id, Stock.warehouse_id, Stock.location_id)
            .filter(
                Stock.tenant_id == tenant_id,
                Stock.warehouse_id == warehouse_id,
            )
            .all()
        )
        existing_keys = {(r.tenant_id, r.product_id, r.warehouse_id, r.location_id) for r in existing}

    location_ids = [loc.id for loc in allowed_locations]
    loc_by_id = {loc.id: loc for loc in allowed_locations}
    current_usage: dict[int, dict] = {}
    created_count = 0
    products_assigned = set()
    locations_used = set()

    # Assign each product to one or more random locations (random number of locations per product, e.g. 1–3)
    for product in products:
        num_locations = random.randint(1, min(3, len(allowed_locations)))
        assigned_any = False
        for _ in range(MAX_ASSIGNMENT_RETRIES):
            if num_locations <= 0:
                break
            loc_id = random.choice(location_ids)
            key = (tenant_id, product.id, warehouse_id, loc_id)
            if key in existing_keys:
                continue
            loc = loc_by_id.get(loc_id)
            if not loc:
                continue
            qty = float(random.randint(1, 100))
            vol = _product_volume_dm3(product) * qty
            weight = (float(product.weight or 0) * qty)
            if _location_has_capacity_constraint(loc) and not _location_can_accept(
                loc_id, current_usage, qty, vol, weight, loc
            ):
                continue
            db.add(
                Stock(
                    tenant_id=tenant_id,
                    product_id=product.id,
                    warehouse_id=warehouse_id,
                    location_id=loc_id,
                    quantity=qty,
                )
            )
            _update_usage(current_usage, loc_id, qty, vol, weight)
            existing_keys.add(key)
            created_count += 1
            products_assigned.add(product.id)
            locations_used.add(loc_id)
            assigned_any = True
            num_locations -= 1

    db.commit()
    return {
        "products_assigned": len(products_assigned),
        "locations_used": len(locations_used),
        "total_stock_rows_created": created_count,
    }
