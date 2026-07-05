"""Record operator substitute decisions — never auto-apply (§3)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from ...models.product_material_substitute import ProductMaterialSubstitute
from ...models.product_recipe_variant import ProductionMaterialSubstitutionDecision
from .substitute_service import list_substitutes_for_product


class SubstituteDecisionError(ValueError):
    pass


def accept_substitute(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    original_component_product_id: int,
    substitute_product_id: int,
    quantity_original: float,
    conversion_ratio: float | None = None,
    production_batch_id: int | None = None,
    production_order_id: int | None = None,
    decided_by_user_id: int | None = None,
    notes: str | None = None,
) -> ProductionMaterialSubstitutionDecision:
    if float(quantity_original) <= 1e-9:
        raise SubstituteDecisionError("Ilość oryginału musi być > 0.")

    ratio = float(conversion_ratio) if conversion_ratio is not None else None
    if ratio is None:
        sub = (
            db.query(ProductMaterialSubstitute)
            .filter(
                ProductMaterialSubstitute.tenant_id == int(tenant_id),
                ProductMaterialSubstitute.product_id == int(original_component_product_id),
                ProductMaterialSubstitute.substitute_product_id == int(substitute_product_id),
                ProductMaterialSubstitute.is_active.is_(True),
            )
            .first()
        )
        if sub is None:
            active = list_substitutes_for_product(
                db, tenant_id=tenant_id, product_id=original_component_product_id, active_only=True
            )
            match = next((s for s in active if int(s.substitute_product_id) == int(substitute_product_id)), None)
            if match is None:
                raise SubstituteDecisionError("Zamiennik nie jest zdefiniowany lub nieaktywny.")
            ratio = float(match.conversion_ratio or 1.0)
        else:
            ratio = float(sub.conversion_ratio or 1.0)

    qty_sub = float(quantity_original) * float(ratio)
    row = ProductionMaterialSubstitutionDecision(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        production_batch_id=int(production_batch_id) if production_batch_id else None,
        production_order_id=int(production_order_id) if production_order_id else None,
        original_component_product_id=int(original_component_product_id),
        substitute_product_id=int(substitute_product_id),
        conversion_ratio=float(ratio),
        quantity_original=round(float(quantity_original), 4),
        quantity_substitute=round(qty_sub, 4),
        status="accepted",
        decided_by_user_id=decided_by_user_id,
        notes=notes,
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    return row
