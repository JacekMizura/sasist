"""Recipe variant registry — STANDARD auto-sync and assignment (§3)."""

from __future__ import annotations

from sqlalchemy.orm import Session, joinedload

from ...models.product_composition import ProductComposition
from ...models.product_recipe_variant import (
    VARIANT_ECONOMIC,
    VARIANT_EMERGENCY,
    VARIANT_EXPORT,
    VARIANT_STANDARD,
    ProductRecipeVariant,
)

PARALLEL_VARIANTS = frozenset({VARIANT_ECONOMIC, VARIANT_EXPORT, VARIANT_EMERGENCY})


class RecipeVariantError(ValueError):
    pass


def list_recipe_variants(
    db: Session,
    *,
    tenant_id: int,
    product_id: int | None = None,
) -> list[ProductRecipeVariant]:
    q = (
        db.query(ProductRecipeVariant)
        .options(
            joinedload(ProductRecipeVariant.product),
            joinedload(ProductRecipeVariant.composition),
        )
        .filter(ProductRecipeVariant.tenant_id == int(tenant_id))
    )
    if product_id is not None:
        q = q.filter(ProductRecipeVariant.product_id == int(product_id))
    return q.order_by(ProductRecipeVariant.product_id, ProductRecipeVariant.priority).all()


def _active_manufacturing_compositions(
    db: Session, *, tenant_id: int, product_id: int
) -> list[ProductComposition]:
    return (
        db.query(ProductComposition)
        .filter(
            ProductComposition.tenant_id == int(tenant_id),
            ProductComposition.product_id == int(product_id),
            ProductComposition.composition_mode == "manufacturing",
            ProductComposition.is_active.is_(True),
        )
        .order_by(ProductComposition.updated_at.desc())
        .all()
    )


def sync_standard_variant_for_product(db: Session, *, tenant_id: int, product_id: int) -> ProductRecipeVariant | None:
    """
    If exactly one active manufacturing recipe → mark as STANDARD.
    Never more than one STANDARD row per product (unique constraint on variant_code).
    """
    active = _active_manufacturing_compositions(db, tenant_id=tenant_id, product_id=int(product_id))
    if len(active) != 1:
        return None
    comp = active[0]
    return assign_recipe_variant(
        db, tenant_id=tenant_id, composition_id=int(comp.id), variant_code=VARIANT_STANDARD, auto=True
    )


def assign_recipe_variant(
    db: Session,
    *,
    tenant_id: int,
    composition_id: int,
    variant_code: str,
    variant_label: str | None = None,
    auto: bool = False,
) -> ProductRecipeVariant:
    """Assign variant to composition. STANDARD replaces any previous STANDARD for product."""
    comp = (
        db.query(ProductComposition)
        .filter(ProductComposition.id == int(composition_id), ProductComposition.tenant_id == int(tenant_id))
        .first()
    )
    if comp is None:
        raise RecipeVariantError("Receptura nie istnieje.")
    if str(comp.composition_mode) != "manufacturing":
        raise RecipeVariantError("Warianty dotyczą tylko receptur produkcyjnych.")

    code = str(variant_code or VARIANT_STANDARD).upper()
    labels = {
        VARIANT_STANDARD: "Receptura standardowa",
        VARIANT_ECONOMIC: "Receptura ekonomiczna",
        VARIANT_EXPORT: "Receptura eksportowa",
        VARIANT_EMERGENCY: "Receptura awaryjna",
    }
    label = variant_label or labels.get(code, code)

    if code == VARIANT_STANDARD:
        (
            db.query(ProductRecipeVariant)
            .filter(
                ProductRecipeVariant.tenant_id == int(tenant_id),
                ProductRecipeVariant.product_id == int(comp.product_id),
                ProductRecipeVariant.variant_code == VARIANT_STANDARD,
                ProductRecipeVariant.composition_id != int(comp.id),
            )
            .delete(synchronize_session=False)
        )

    existing = (
        db.query(ProductRecipeVariant)
        .filter(
            ProductRecipeVariant.tenant_id == int(tenant_id),
            ProductRecipeVariant.product_id == int(comp.product_id),
            ProductRecipeVariant.variant_code == code,
        )
        .first()
    )
    if existing is not None:
        existing.composition_id = int(comp.id)
        existing.variant_label = label
        existing.is_default = code == VARIANT_STANDARD
        existing.is_active = True
        db.flush()
        return existing

    row = ProductRecipeVariant(
        tenant_id=int(tenant_id),
        product_id=int(comp.product_id),
        composition_id=int(comp.id),
        variant_code=code,
        variant_label=label,
        priority=10 if code == VARIANT_STANDARD else 20,
        is_default=code == VARIANT_STANDARD,
        is_active=True,
    )
    db.add(row)
    db.flush()
    return row


def on_composition_activation(db: Session, *, tenant_id: int, composition: ProductComposition) -> None:
    """Hook after composition activated — auto STANDARD when sole active recipe."""
    if not composition.is_active or str(composition.composition_mode) != "manufacturing":
        return
    sync_standard_variant_for_product(db, tenant_id=tenant_id, product_id=int(composition.product_id))


def variant_codes_for_product(db: Session, *, tenant_id: int, product_id: int) -> list[str]:
    rows = (
        db.query(ProductRecipeVariant.variant_code)
        .filter(
            ProductRecipeVariant.tenant_id == int(tenant_id),
            ProductRecipeVariant.product_id == int(product_id),
            ProductRecipeVariant.is_active.is_(True),
        )
        .all()
    )
    return [str(r[0]) for r in rows]
