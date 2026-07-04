"""CRUD for product material substitutes."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session, joinedload

from ...models.product import Product
from ...models.product_material_substitute import ProductMaterialSubstitute


class SubstituteError(ValueError):
    def __init__(self, message: str, *, code: str = "substitute_error"):
        super().__init__(message)
        self.code = code


def list_substitutes_for_product(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
    active_only: bool = True,
) -> list[ProductMaterialSubstitute]:
    q = (
        db.query(ProductMaterialSubstitute)
        .options(joinedload(ProductMaterialSubstitute.substitute_product))
        .filter(
            ProductMaterialSubstitute.tenant_id == int(tenant_id),
            ProductMaterialSubstitute.product_id == int(product_id),
        )
    )
    if active_only:
        q = q.filter(ProductMaterialSubstitute.is_active.is_(True))
    return q.order_by(ProductMaterialSubstitute.priority.asc(), ProductMaterialSubstitute.id.asc()).all()


def list_all_substitutes(db: Session, *, tenant_id: int, product_id: int | None = None) -> list[ProductMaterialSubstitute]:
    q = (
        db.query(ProductMaterialSubstitute)
        .options(
            joinedload(ProductMaterialSubstitute.product),
            joinedload(ProductMaterialSubstitute.substitute_product),
        )
        .filter(ProductMaterialSubstitute.tenant_id == int(tenant_id))
    )
    if product_id is not None:
        q = q.filter(ProductMaterialSubstitute.product_id == int(product_id))
    return q.order_by(ProductMaterialSubstitute.product_id, ProductMaterialSubstitute.priority).all()


def create_substitute(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
    substitute_product_id: int,
    priority: int = 10,
    conversion_ratio: float = 1.0,
    is_active: bool = True,
    notes: str | None = None,
) -> ProductMaterialSubstitute:
    if int(product_id) == int(substitute_product_id):
        raise SubstituteError("Produkt nie może być zamiennikiem samego siebie.", code="self_reference")
    if float(conversion_ratio) <= 1e-9:
        raise SubstituteError("Współczynnik zamiany musi być > 0.", code="invalid_ratio")
    for pid in (product_id, substitute_product_id):
        p = db.query(Product).filter(Product.id == int(pid), Product.tenant_id == int(tenant_id)).first()
        if p is None:
            raise SubstituteError(f"Produkt #{pid} nie istnieje.", code="not_found")
    existing = (
        db.query(ProductMaterialSubstitute)
        .filter(
            ProductMaterialSubstitute.tenant_id == int(tenant_id),
            ProductMaterialSubstitute.product_id == int(product_id),
            ProductMaterialSubstitute.substitute_product_id == int(substitute_product_id),
        )
        .first()
    )
    if existing is not None:
        raise SubstituteError("Ten zamiennik jest już zdefiniowany.", code="duplicate")
    row = ProductMaterialSubstitute(
        tenant_id=int(tenant_id),
        product_id=int(product_id),
        substitute_product_id=int(substitute_product_id),
        priority=int(priority),
        conversion_ratio=float(conversion_ratio),
        is_active=bool(is_active),
        notes=(str(notes).strip() or None) if notes else None,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    return row


def update_substitute(
    db: Session,
    *,
    tenant_id: int,
    substitute_id: int,
    priority: int | None = None,
    conversion_ratio: float | None = None,
    is_active: bool | None = None,
    notes: str | None = None,
) -> ProductMaterialSubstitute:
    row = (
        db.query(ProductMaterialSubstitute)
        .filter(ProductMaterialSubstitute.id == int(substitute_id), ProductMaterialSubstitute.tenant_id == int(tenant_id))
        .first()
    )
    if row is None:
        raise SubstituteError("Zamiennik nie istnieje.", code="not_found")
    if priority is not None:
        row.priority = int(priority)
    if conversion_ratio is not None:
        if float(conversion_ratio) <= 1e-9:
            raise SubstituteError("Współczynnik zamiany musi być > 0.", code="invalid_ratio")
        row.conversion_ratio = float(conversion_ratio)
    if is_active is not None:
        row.is_active = bool(is_active)
    if notes is not None:
        row.notes = str(notes).strip() or None
    row.updated_at = datetime.utcnow()
    db.flush()
    return row


def delete_substitute(db: Session, *, tenant_id: int, substitute_id: int) -> None:
    row = (
        db.query(ProductMaterialSubstitute)
        .filter(ProductMaterialSubstitute.id == int(substitute_id), ProductMaterialSubstitute.tenant_id == int(tenant_id))
        .first()
    )
    if row is None:
        raise SubstituteError("Zamiennik nie istnieje.", code="not_found")
    db.delete(row)
    db.flush()
