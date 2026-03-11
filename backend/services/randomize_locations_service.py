"""
Testing utility: randomly assign product inventory to warehouse locations.

Used for testing analytics, slotting and picking simulations.
Only modifies inventory.location_id for rows with quantity > 0.
Does not delete inventory rows.
"""

import random
from sqlalchemy.orm import Session

from ..models.inventory import Inventory
from ..models.location import Location
from ..models.product import Product


# Location types that are valid storage (exclude special route nodes)
EXCLUDED_LOCATION_TYPES = ("PICK_START", "PACKING", "DOCK")
MAX_ASSIGNMENT_RETRIES = 50


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
    """Check if adding this quantity/volume/weight would exceed location capacity."""
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


def randomize_product_locations(
    db: Session,
    warehouse_id: int,
    tenant_id: int,
) -> dict:
    """
    For each inventory record (tenant, warehouse, quantity > 0), assign a random
    allowed location. Allowed locations: location_type not in PICK_START, PACKING, DOCK.
    Respects location capacity (max_volume, max_weight, max_units) if present.
    Returns { products_processed, assigned_successfully, failed_assignments }.
    """
    inventory_rows = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == tenant_id,
            Inventory.warehouse_id == warehouse_id,
            Inventory.quantity > 0,
        )
        .all()
    )
    if not inventory_rows:
        return {"products_processed": 0, "assigned_successfully": 0, "failed_assignments": 0}

    allowed_locations = (
        db.query(Location)
        .filter(
            Location.warehouse_id == warehouse_id,
            ~Location.location_type.in_(EXCLUDED_LOCATION_TYPES),
        )
        .all()
    )
    if not allowed_locations:
        return {
            "products_processed": len(inventory_rows),
            "assigned_successfully": 0,
            "failed_assignments": len(inventory_rows),
        }

    loc_by_id = {loc.id: loc for loc in allowed_locations}
    location_ids = [loc.id for loc in allowed_locations]
    product_ids = list({inv.product_id for inv in inventory_rows})
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(product_ids)).all()}

    current_usage: dict[int, dict] = {}
    assigned = 0
    failed = 0

    for inv in inventory_rows:
        product = products.get(inv.product_id)
        qty = float(inv.quantity)
        vol = _product_volume_dm3(product) * qty if product else 0.0
        weight = (float(product.weight or 0) * qty) if product else 0.0

        chosen_location_id = None
        for _ in range(MAX_ASSIGNMENT_RETRIES):
            loc_id = random.choice(location_ids)
            loc = loc_by_id.get(loc_id)
            if not loc:
                continue
            if _location_has_capacity_constraint(loc) and not _location_can_accept(
                loc_id, current_usage, qty, vol, weight, loc
            ):
                continue
            chosen_location_id = loc_id
            break

        if chosen_location_id is not None:
            inv.location_id = chosen_location_id
            _update_usage(current_usage, chosen_location_id, qty, vol, weight)
            assigned += 1
        else:
            failed += 1

    db.commit()
    return {
        "products_processed": len(inventory_rows),
        "assigned_successfully": assigned,
        "failed_assignments": failed,
    }
