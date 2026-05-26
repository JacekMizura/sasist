"""
Rules: which catalog products are valid for a given supplier on purchase orders.

Products are allowed if they appear in ``supplier_products`` for that supplier,
or (legacy) if ``Product.default_supplier_id`` equals the supplier.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from sqlalchemy import and_, exists, or_

if TYPE_CHECKING:
    from sqlalchemy.orm import Query, Session

from ..models.product import Product
from ..models.supplier_product import SupplierProduct


def apply_supplier_product_filter(query: "Query", supplier_id: int) -> "Query":
    """Restrict products to supplier catalog (link table) or legacy default supplier."""
    sid = int(supplier_id)
    linked = exists().where(
        SupplierProduct.supplier_id == sid,
        SupplierProduct.product_id == Product.id,
    )
    legacy_default = and_(
        Product.default_supplier_id.isnot(None),
        Product.default_supplier_id == sid,
    )
    return query.filter(or_(linked, legacy_default))


def product_allowed_for_supplier(db: "Session", product: Product, supplier_id: int) -> bool:
    sid = int(supplier_id)
    if getattr(product, "default_supplier_id", None) == sid:
        return True
    row = (
        db.query(SupplierProduct.id)
        .filter(
            SupplierProduct.product_id == product.id,
            SupplierProduct.supplier_id == sid,
        )
        .first()
    )
    return row is not None


def purchase_price_for_supplier(db: "Session", product: Product, supplier_id: int) -> Optional[float]:
    """Prefer ``supplier_products.purchase_price``; else product master ``purchase_price``."""
    sid = int(supplier_id)
    row = (
        db.query(SupplierProduct)
        .filter(SupplierProduct.product_id == product.id, SupplierProduct.supplier_id == sid)
        .first()
    )
    if row is not None and row.purchase_price is not None:
        return float(row.purchase_price)
    pp = getattr(product, "purchase_price", None)
    return float(pp) if pp is not None else None
