"""
Central SKU / catalog-number allocation for all products.

Counters are per tenant + kind + sequence_key (template with CODE applied).
Generate/preview never writes to products — callers fill form fields only.
"""

from __future__ import annotations

from typing import Literal, Optional

from sqlalchemy.orm import Session

from ...models.product import Product
from ...models.product_category import ProductCategory
from ...models.product_code_sequence import ProductCodeSequence
from ..product_categories import get_category
from ..product_categories.errors import CategoryNotFoundError, CategoryValidationError
from .errors import (
    ProductCodeNoCategoryError,
    ProductCodeNotConfiguredError,
    ProductCodeValidationError,
)
from .template_engine import (
    DEFAULT_TEMPLATE,
    normalize_code,
    normalize_template,
    render_code,
    sequence_key_for,
    template_requires_sequence,
)

CodeKind = Literal["sku", "catalog"]


def _kind_fields(category: ProductCategory, kind: CodeKind) -> tuple[Optional[str], Optional[str]]:
    if kind == "sku":
        return getattr(category, "sku_code", None), getattr(category, "sku_template", None)
    return getattr(category, "catalog_code", None), getattr(category, "catalog_template", None)


def resolve_category_numbering(
    category: ProductCategory,
    kind: CodeKind,
) -> tuple[str, str]:
    """Return (code, template) or raise if not configured."""
    code_raw, template_raw = _kind_fields(category, kind)
    code = normalize_code(code_raw)
    template = (template_raw or "").strip()
    if not code or not template:
        raise ProductCodeNotConfiguredError()
    return code, normalize_template(template)


def _get_or_create_sequence(
    db: Session,
    tenant_id: int,
    *,
    kind: CodeKind,
    sequence_key: str,
) -> ProductCodeSequence:
    row = (
        db.query(ProductCodeSequence)
        .filter(
            ProductCodeSequence.tenant_id == tenant_id,
            ProductCodeSequence.kind == kind,
            ProductCodeSequence.sequence_key == sequence_key,
        )
        .with_for_update()
        .first()
    )
    if row is None:
        row = ProductCodeSequence(
            tenant_id=tenant_id,
            kind=kind,
            sequence_key=sequence_key,
            last_value=0,
        )
        db.add(row)
        db.flush()
        # Re-lock for concurrent creates
        row = (
            db.query(ProductCodeSequence)
            .filter(
                ProductCodeSequence.tenant_id == tenant_id,
                ProductCodeSequence.kind == kind,
                ProductCodeSequence.sequence_key == sequence_key,
            )
            .with_for_update()
            .first()
        )
        assert row is not None
    return row


def peek_next_n(db: Session, tenant_id: int, *, kind: CodeKind, sequence_key: str) -> int:
    row = (
        db.query(ProductCodeSequence)
        .filter(
            ProductCodeSequence.tenant_id == tenant_id,
            ProductCodeSequence.kind == kind,
            ProductCodeSequence.sequence_key == sequence_key,
        )
        .first()
    )
    return int(row.last_value if row is not None else 0) + 1


def allocate_next_n(db: Session, tenant_id: int, *, kind: CodeKind, sequence_key: str) -> int:
    row = _get_or_create_sequence(db, tenant_id, kind=kind, sequence_key=sequence_key)
    row.last_value = int(row.last_value or 0) + 1
    db.flush()
    return int(row.last_value)


def _category_for_product(
    db: Session,
    tenant_id: int,
    product_id: Optional[int],
    category_id: Optional[int],
    *,
    kind: CodeKind,
) -> ProductCategory:
    cid = category_id
    if cid is None and product_id is not None:
        product = (
            db.query(Product)
            .filter(Product.tenant_id == tenant_id, Product.id == product_id, Product.deleted_at.is_(None))
            .first()
        )
        if product is None:
            raise ProductCodeValidationError(f"Nie znaleziono produktu #{product_id}.")
        cid = getattr(product, "primary_category_id", None)
    if cid is None:
        raise ProductCodeNoCategoryError(kind)
    try:
        return get_category(db, tenant_id, int(cid))
    except CategoryNotFoundError as e:
        raise ProductCodeNoCategoryError(kind) from e
    except CategoryValidationError as e:
        raise ProductCodeValidationError(str(e)) from e


def preview_or_allocate(
    db: Session,
    tenant_id: int,
    *,
    kind: CodeKind,
    category_id: Optional[int] = None,
    product_id: Optional[int] = None,
    allocate: bool = False,
) -> dict:
    if kind not in ("sku", "catalog"):
        raise ProductCodeValidationError("Nieprawidłowy rodzaj kodu.")

    category = _category_for_product(db, tenant_id, product_id, category_id, kind=kind)
    code, template = resolve_category_numbering(category, kind)
    seq_key = sequence_key_for(kind=kind, code=code, template=template)

    if template_requires_sequence(template):
        n = allocate_next_n(db, tenant_id, kind=kind, sequence_key=seq_key) if allocate else peek_next_n(
            db, tenant_id, kind=kind, sequence_key=seq_key
        )
    else:
        n = 0

    value = render_code(template=template, code=code, sequence_n=n)
    return {
        "kind": kind,
        "category_id": int(category.id),
        "code": code,
        "template": template,
        "sequence_key": seq_key,
        "sequence_n": n,
        "value": value,
        "allocated": bool(allocate),
    }


# Re-export default for callers configuring new categories
__all__ = [
    "DEFAULT_TEMPLATE",
    "allocate_next_n",
    "peek_next_n",
    "preview_or_allocate",
    "resolve_category_numbering",
    "sequence_key_for",
]
