"""
Migracja stanów z lokalizacji-placeholder („Import”) na strefę przyjęcia + dezaktywacja pustej lokalizacji.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.inventory import Inventory
from ..models.inventory_unit import InventoryUnit
from ..models.location import Location
from .default_receiving_location import find_receiving_location, get_or_create_stock_location

logger = logging.getLogger(__name__)

_PLACEHOLDER_NAMES = ("import",)


def _merge_inventory_to_location(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    inv: Inventory,
    target_loc: Location,
) -> None:
    target_id = int(target_loc.id)
    if int(inv.location_id) == target_id:
        return
    to_uuid = getattr(target_loc, "location_uuid", None) or None
    existing = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == tenant_id,
            Inventory.product_id == inv.product_id,
            Inventory.warehouse_id == warehouse_id,
            Inventory.location_id == target_id,
            Inventory.batch_number == inv.batch_number,
            Inventory.expiry_date == inv.expiry_date,
        )
        .first()
    )
    from_id = int(inv.location_id)
    if existing:
        existing.quantity = float(existing.quantity or 0) + float(inv.quantity or 0)
        if to_uuid and getattr(existing, "location_uuid", None) != to_uuid:
            existing.location_uuid = to_uuid
        db.delete(inv)
        for unit in db.query(InventoryUnit).filter(
            InventoryUnit.tenant_id == tenant_id,
            InventoryUnit.product_id == inv.product_id,
            InventoryUnit.warehouse_id == warehouse_id,
            InventoryUnit.location_id == from_id,
        ):
            ex_u = (
                db.query(InventoryUnit)
                .filter(
                    InventoryUnit.tenant_id == tenant_id,
                    InventoryUnit.product_id == inv.product_id,
                    InventoryUnit.warehouse_id == warehouse_id,
                    InventoryUnit.location_id == target_id,
                )
                .first()
            )
            if ex_u:
                ex_u.quantity = float(ex_u.quantity or 0) + float(unit.quantity or 0)
                ex_u.reserved_quantity = float(ex_u.reserved_quantity or 0) + float(unit.reserved_quantity or 0)
                db.delete(unit)
            else:
                unit.location_id = target_id
    else:
        inv.location_id = target_id
        if to_uuid:
            inv.location_uuid = to_uuid
        for unit in db.query(InventoryUnit).filter(
            InventoryUnit.tenant_id == tenant_id,
            InventoryUnit.product_id == inv.product_id,
            InventoryUnit.warehouse_id == warehouse_id,
            InventoryUnit.location_id == from_id,
        ):
            unit.location_id = target_id
    db.flush()


def cleanup_import_placeholder_locations(
    db: Session,
    *,
    warehouse_id: int | None = None,
    dry_run: bool = True,
) -> dict[str, Any]:
    """
    Dla każdego magazynu: znajdź lokalizację o nazwie „Import”, przenieś wiersze ``inventory`` na strefę przyjęcia,
    usuń zerowe resztki, ustaw ``is_active=False`` na pustym „Import”.
    """
    q = (
        db.query(Location)
        .execution_options(include_inactive=True)
        .filter(func.lower(Location.name).in_(_PLACEHOLDER_NAMES))
    )
    if warehouse_id is not None:
        q = q.filter(Location.warehouse_id == int(warehouse_id))
    placeholder_locs = q.order_by(Location.warehouse_id, Location.id).all()

    stats: dict[str, Any] = {
        "placeholder_locations": len(placeholder_locs),
        "inventory_rows_moved": 0,
        "zero_rows_deleted": 0,
        "locations_deactivated": 0,
        "pending_rows_needing_new_receiving_zone": 0,
        "skipped": [],
    }

    for src in placeholder_locs:
        wid = int(src.warehouse_id)
        inv_rows = (
            db.query(Inventory)
            .filter(Inventory.warehouse_id == wid, Inventory.location_id == src.id)
            .all()
        )
        tgt = find_receiving_location(db, wid)
        if tgt is None or int(tgt.id) == int(src.id):
            if not dry_run:
                tgt = get_or_create_stock_location(db, wid, None)
        if tgt is None or int(tgt.id) == int(src.id):
            pos = sum(1 for inv in inv_rows if float(inv.quantity or 0) > 0.0)
            stats["pending_rows_needing_new_receiving_zone"] += pos
            stats["skipped"].append(
                {
                    "warehouse_id": wid,
                    "location_id": src.id,
                    "reason": "no_active_receiving_location",
                    "positive_qty_rows": pos,
                    "hint": "Run with --apply to create receiving zone (WMS_DEFAULT_RECEIVING_LOCATION_NAMES) or add an active DOCK/PICK_START location.",
                },
            )
            continue

        for inv in inv_rows:
            qty = float(inv.quantity or 0)
            if qty == 0.0:
                if not dry_run:
                    db.delete(inv)
                stats["zero_rows_deleted"] += 1
                continue
            if not dry_run:
                _merge_inventory_to_location(db, int(inv.tenant_id), wid, inv, tgt)
            stats["inventory_rows_moved"] += 1

        if not dry_run:
            db.flush()
            remaining = (
                db.query(Inventory)
                .filter(Inventory.warehouse_id == wid, Inventory.location_id == src.id)
                .count()
            )
            if remaining == 0:
                src.is_active = False
                stats["locations_deactivated"] += 1
                logger.info("Deactivated placeholder location id=%s warehouse_id=%s", src.id, wid)

    if dry_run:
        db.rollback()
    else:
        db.commit()

    return stats
