"""Material availability — max producible from BOM components."""

from __future__ import annotations

import math

from sqlalchemy.orm import Session, joinedload

from ...models.product_composition import ProductComposition
from ..composition_engine_service import effective_line_qty
from ..production_recipe_card_service import _max_producible
from ..reservations.availability_service import warehouse_net_available


def _warehouse_stock(db: Session, *, tenant_id: int, warehouse_id: int, product_id: int) -> float:
    return warehouse_net_available(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), product_id=int(product_id)
    )


def max_producible_by_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    composition_ids: list[int],
) -> dict[int, float]:
    if not composition_ids:
        return {}
    comps = (
        db.query(ProductComposition)
        .options(joinedload(ProductComposition.lines))
        .filter(
            ProductComposition.id.in_(tuple(int(x) for x in composition_ids)),
            ProductComposition.tenant_id == int(tenant_id),
        )
        .all()
    )
    out: dict[int, float] = {}
    for comp in comps:
        pid = int(comp.product_id)
        out[pid] = _max_producible(db, tenant_id=tenant_id, warehouse_id=warehouse_id, composition=comp)
    return out


def material_shortages_for_quantity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    composition: ProductComposition,
    quantity: float,
) -> list[dict[str, object]]:
    """Components missing for requested finished-goods qty."""
    yld = float(composition.yield_quantity or 1) or 1.0
    shortages: list[dict[str, object]] = []
    for ln in composition.lines or []:
        per = effective_line_qty(ln, yield_qty=yld)
        if per <= 1e-9:
            continue
        need = per * float(quantity)
        avail = _warehouse_stock(
            db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=int(ln.component_product_id)
        )
        if avail + 1e-6 < need:
            shortages.append(
                {
                    "component_product_id": int(ln.component_product_id),
                    "required": round(need, 4),
                    "available": round(avail, 4),
                    "shortage": round(max(0.0, need - avail), 4),
                }
            )
    return shortages


def cap_by_materials(requested: float, max_producible: float) -> float:
    if requested <= 0:
        return 0.0
    if max_producible <= 0:
        return 0.0
    return min(requested, float(math.floor(max_producible)))
