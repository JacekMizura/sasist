"""Set absolute packaging inventory quantity (admin adjust) via Inventory engine."""

from __future__ import annotations

from sqlalchemy.orm import Session

from .inventory_apply import apply_packaging_inventory_issue, apply_packaging_inventory_receive
from .inventory_qty import packaging_inventory_quantity
from .stockable_bridge import resolve_product_id_for_wm

_EPS = 1e-9


def set_packaging_inventory_absolute(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    wm_kind: str,
    wm_id: str,
    target_qty: float,
    location_label: str | None = None,
) -> float:
    product_id = resolve_product_id_for_wm(db, tenant_id, wm_kind, wm_id)
    if product_id is None:
        raise ValueError("Nie znaleziono materiału opakowaniowego")
    current = packaging_inventory_quantity(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=int(product_id)
    )
    target = float(target_qty or 0)
    delta = target - current
    if abs(delta) <= _EPS:
        return current
    if delta > 0:
        apply_packaging_inventory_receive(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            wm_kind=wm_kind,
            wm_id=wm_id,
            qty=delta,
            location_label=location_label,
        )
    else:
        apply_packaging_inventory_issue(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            product_id=int(product_id),
            qty=-delta,
            allow_negative=False,
        )
    return packaging_inventory_quantity(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=int(product_id)
    )
