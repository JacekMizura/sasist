"""Apply packaging stock deltas through Inventory (same engine as products)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session

from ...models.inventory import Inventory
from .inventory_qty import packaging_inventory_quantity
from .location_resolve import resolve_packaging_default_location_id
from .stockable_bridge import resolve_product_id_for_wm

_EPS = 1e-9
_NO_EXPIRY = date(9999, 12, 31)


def _get_or_create_inventory_row(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    location_id: int,
) -> Inventory:
    row = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Inventory.location_id == int(location_id),
            Inventory.batch_number == "",
            Inventory.expiry_date == _NO_EXPIRY,
        )
        .first()
    )
    if row is not None:
        return row
    row = Inventory(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        product_id=int(product_id),
        location_id=int(location_id),
        quantity=0.0,
        batch_number="",
        expiry_date=_NO_EXPIRY,
        stock_disposition="SALEABLE",
    )
    db.add(row)
    db.flush()
    return row


def apply_packaging_inventory_receive(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    wm_kind: str,
    wm_id: str,
    qty: float,
    location_id: Optional[int] = None,
    location_label: Optional[str] = None,
) -> int:
    """Increase Inventory for a packaging WM ref. Returns product_id."""
    if float(qty or 0) <= _EPS:
        raise ValueError("qty must be positive")
    product_id = resolve_product_id_for_wm(db, tenant_id, wm_kind, wm_id)
    if product_id is None:
        raise ValueError(f"Nie znaleziono materiału opakowaniowego: {wm_kind}:{wm_id}")
    loc_id = location_id or resolve_packaging_default_location_id(
        db, warehouse_id=warehouse_id, preferred_label=location_label
    )
    if loc_id is None:
        raise ValueError("Brak lokalizacji magazynowej dla przyjęcia materiału opakowaniowego")
    inv = _get_or_create_inventory_row(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        location_id=int(loc_id),
    )
    inv.quantity = float(inv.quantity or 0) + float(qty)
    return int(product_id)


def apply_packaging_inventory_issue(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    qty: float,
    location_id: Optional[int] = None,
    allow_negative: bool = False,
) -> int:
    """
    Decrease Inventory FIFO by location (largest qty first when location not set).
    Returns the location_id used for the primary slice (last location touched).
    """
    need = float(qty or 0)
    if need <= _EPS:
        raise ValueError("qty must be positive")

    if location_id is not None:
        inv = _get_or_create_inventory_row(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            product_id=product_id,
            location_id=int(location_id),
        )
        available = float(inv.quantity or 0)
        if available + _EPS < need and not allow_negative:
            raise ValueError("Niewystarczający stan materiału opakowaniowego na lokalizacji")
        inv.quantity = available - need
        if not allow_negative and inv.quantity < 0:
            inv.quantity = 0.0
        return int(location_id)

    rows = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Inventory.quantity > 0,
        )
        .order_by(Inventory.quantity.desc(), Inventory.id.asc())
        .all()
    )
    remaining = need
    last_loc: Optional[int] = None
    for inv in rows:
        take = min(float(inv.quantity or 0), remaining)
        if take <= _EPS:
            continue
        inv.quantity = float(inv.quantity or 0) - take
        remaining -= take
        last_loc = int(inv.location_id)
        if remaining <= _EPS:
            break
    if remaining > _EPS:
        if not allow_negative:
            raise ValueError("Niewystarczający stan materiału opakowaniowego")
        # Fall back: put negative on default location
        loc_id = resolve_packaging_default_location_id(db, warehouse_id=warehouse_id)
        if loc_id is None:
            raise ValueError("Brak lokalizacji magazynowej dla rozchodu materiału opakowaniowego")
        inv = _get_or_create_inventory_row(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            product_id=product_id,
            location_id=int(loc_id),
        )
        inv.quantity = float(inv.quantity or 0) - remaining
        last_loc = int(loc_id)
    if last_loc is None:
        loc_id = resolve_packaging_default_location_id(db, warehouse_id=warehouse_id)
        if loc_id is None:
            raise ValueError("Brak lokalizacji magazynowej dla rozchodu materiału opakowaniowego")
        return int(loc_id)
    return int(last_loc)


def migrate_scalar_stock_to_inventory(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    scalar_qty: float,
    location_label: Optional[str] = None,
) -> None:
    """One-shot migration helper: move legacy catalog.stock into Inventory."""
    qty = float(scalar_qty or 0)
    if qty <= _EPS:
        return
    current = packaging_inventory_quantity(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=product_id
    )
    if current > _EPS:
        return  # already migrated
    loc_id = resolve_packaging_default_location_id(
        db, warehouse_id=warehouse_id, preferred_label=location_label
    )
    if loc_id is None:
        return
    inv = _get_or_create_inventory_row(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        location_id=int(loc_id),
    )
    inv.quantity = float(inv.quantity or 0) + qty

