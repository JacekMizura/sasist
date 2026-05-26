"""
Dev utility: distribute inventory from Import location into real warehouse storage locations.

Finds inventory at the "Import" location and moves it to randomly selected storage locations.
Optionally splits large quantities across multiple locations.
"""

import random
from sqlalchemy.orm import Session

from ..models.inventory import Inventory
from ..models.location import Location

EXCLUDED_LOCATION_TYPES = ("PICK_START", "PACKING", "DOCK")
EXCLUDED_LOCATION_NAMES = (
    "IMPORT",
    "BUFFER",
    "PACKING",
    "PRZYJĘCIE",
    "PRZYJECIE",
    "BUFOR",
    "ODBIÓR",
    "ODBIOR",
)
SPLIT_THRESHOLD = 50  # If quantity > this, split into 2-3 locations


def _is_storage_location(loc: Location) -> bool:
    if loc.location_type in EXCLUDED_LOCATION_TYPES:
        return False
    name_upper = (loc.name or "").upper()
    for excluded in EXCLUDED_LOCATION_NAMES:
        if excluded in name_upper:
            return False
    return True


def distribute_import_stock(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
) -> dict:
    """
    Find inventory at Import location; move each row to random storage location(s).
    If quantity > SPLIT_THRESHOLD, split into 2-3 locations for realistic distribution.
    Returns { rows_processed, locations_used }.
    """
    import_loc = (
        db.query(Location)
        .filter(
            Location.warehouse_id == warehouse_id,
            Location.name.ilike("Import"),
        )
        .first()
    )
    if not import_loc:
        return {"rows_processed": 0, "locations_used": 0}

    stock_rows = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == tenant_id,
            Inventory.warehouse_id == warehouse_id,
            Inventory.location_id == import_loc.id,
        )
        .all()
    )
    if not stock_rows:
        return {"rows_processed": 0, "locations_used": 0}

    all_locations = (
        db.query(Location)
        .filter(
            Location.warehouse_id == warehouse_id,
            ~Location.location_type.in_(EXCLUDED_LOCATION_TYPES),
        )
        .all()
    )
    storage_locations = [loc for loc in all_locations if _is_storage_location(loc)]
    if not storage_locations:
        return {"rows_processed": 0, "locations_used": 0}

    location_ids = [loc.id for loc in storage_locations]
    location_uuid_by_id = {loc.id: getattr(loc, "location_uuid", None) for loc in storage_locations}
    rows_processed = 0
    locations_used = set()

    for row in stock_rows:
        qty = float(row.quantity or 0)
        if qty <= 0:
            continue

        if qty > SPLIT_THRESHOLD and len(storage_locations) >= 2:
            # Split into 2 or 3 parts for realistic distribution
            n_parts = min(3, len(storage_locations), 2 + (1 if qty > 100 else 0))
            base = qty / n_parts
            parts = [round(base, 2) for _ in range(n_parts)]
            diff = qty - sum(parts)
            if diff != 0:
                parts[0] = round(parts[0] + diff, 2)
            chosen_ids = random.sample(location_ids, n_parts)
            row.location_id = chosen_ids[0]
            row.location_uuid = location_uuid_by_id.get(chosen_ids[0])
            row.quantity = parts[0]
            locations_used.add(chosen_ids[0])
            for i in range(1, n_parts):
                db.add(
                    Inventory(
                        tenant_id=row.tenant_id,
                        product_id=row.product_id,
                        warehouse_id=row.warehouse_id,
                        location_id=chosen_ids[i],
                        location_uuid=location_uuid_by_id.get(chosen_ids[i]),
                        quantity=parts[i],
                    )
                )
                locations_used.add(chosen_ids[i])
        else:
            loc_id = random.choice(location_ids)
            row.location_id = loc_id
            row.location_uuid = location_uuid_by_id.get(loc_id)
            locations_used.add(loc_id)

        rows_processed += 1

    db.commit()
    return {
        "rows_processed": rows_processed,
        "locations_used": len(locations_used),
    }
