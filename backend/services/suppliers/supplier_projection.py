"""Map Supplier ORM rows to API read models."""

from __future__ import annotations

from typing import Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...catalog.supplier_taxonomy import country_is_eu
from ...models.inbound_delivery import InboundDelivery
from ...models.supplier import Supplier
from ...models.supplier_product import SupplierProduct
from ...schemas.supplier import SupplierRead


def strip_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def delivery_counts(db: Session, tenant_id: int, supplier_ids: List[int]) -> Dict[int, int]:
    if not supplier_ids:
        return {}
    rows = (
        db.query(InboundDelivery.supplier_id, func.count(InboundDelivery.id))
        .filter(InboundDelivery.tenant_id == tenant_id, InboundDelivery.supplier_id.in_(supplier_ids))
        .group_by(InboundDelivery.supplier_id)
        .all()
    )
    return {int(sid): int(count or 0) for sid, count in rows if sid is not None}


def product_counts(db: Session, tenant_id: int, supplier_ids: List[int]) -> Dict[int, int]:
    if not supplier_ids:
        return {}
    rows = (
        db.query(SupplierProduct.supplier_id, func.count(SupplierProduct.id))
        .filter(SupplierProduct.tenant_id == tenant_id, SupplierProduct.supplier_id.in_(supplier_ids))
        .group_by(SupplierProduct.supplier_id)
        .all()
    )
    return {int(sid): int(count or 0) for sid, count in rows if sid is not None}


def supplier_to_read(
    row: Supplier,
    *,
    delivery_count: int,
    product_count: int = 0,
) -> SupplierRead:
    mov = getattr(row, "minimum_order_value", None)
    mov_f = float(mov) if mov is not None else None
    country = strip_optional_text(getattr(row, "country", None))
    free_threshold = getattr(row, "free_shipping_threshold", None)
    return SupplierRead(
        id=row.id,
        tenant_id=row.tenant_id,
        name=row.name,
        company_name=strip_optional_text(getattr(row, "company_name", None)),
        tax_id=strip_optional_text(getattr(row, "tax_id", None)),
        email=strip_optional_text(getattr(row, "email", None)),
        phone=strip_optional_text(getattr(row, "phone", None)),
        website=strip_optional_text(getattr(row, "website", None)),
        country=country,
        city=strip_optional_text(getattr(row, "city", None)),
        postal_code=strip_optional_text(getattr(row, "postal_code", None)),
        street=strip_optional_text(getattr(row, "street", None)),
        address=strip_optional_text(getattr(row, "address", None)),
        active=bool(row.active),
        default_lead_time_days=getattr(row, "default_lead_time_days", None),
        default_currency=strip_optional_text(getattr(row, "default_currency", None)),
        minimum_order_value=round(mov_f, 2) if mov_f is not None else None,
        minimum_order_qty=getattr(row, "minimum_order_qty", None),
        free_shipping_threshold=(
            round(float(free_threshold), 2) if free_threshold is not None else None
        ),
        offers_free_shipping=bool(getattr(row, "offers_free_shipping", True)),
        requires_moq=bool(getattr(row, "requires_moq", True)),
        notes=strip_optional_text(getattr(row, "notes", None)),
        delivery_count=int(delivery_count),
        product_count=int(product_count),
        is_incomplete=bool(getattr(row, "is_incomplete", False)),
        country_is_eu=country_is_eu(country),
    )
