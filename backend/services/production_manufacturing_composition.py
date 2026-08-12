"""Active manufacturing BOM lookup — ProductComposition SSOT (no is_producible flag)."""

from __future__ import annotations

from sqlalchemy.orm import Session, joinedload

from ..models.product_composition import ProductComposition


def get_active_manufacturing_composition(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
) -> ProductComposition | None:
    """
    Returns the active manufacturing composition for a product, or None.

    Qualifies a product for order-driven production only when this returns a row.
    """
    return (
        db.query(ProductComposition)
        .options(joinedload(ProductComposition.lines))
        .filter(
            ProductComposition.tenant_id == int(tenant_id),
            ProductComposition.product_id == int(product_id),
            ProductComposition.composition_mode == "manufacturing",
            ProductComposition.is_active.is_(True),
        )
        .order_by(ProductComposition.updated_at.desc(), ProductComposition.id.desc())
        .first()
    )


def product_has_active_manufacturing_composition(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
) -> bool:
    return get_active_manufacturing_composition(db, tenant_id=tenant_id, product_id=product_id) is not None
