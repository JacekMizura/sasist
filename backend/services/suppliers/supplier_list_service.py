"""List suppliers for a tenant — query, projection, schema self-heal."""

from __future__ import annotations

import logging
from typing import List, Optional

from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import Session

from ...database import engine
from ...db.schema_upgrade import (
    ensure_manufacturer_supplier_business_entity_columns,
    ensure_supplier_assortment_columns_and_product_default_supplier,
    ensure_supplier_purchasing_columns,
    ensure_wms_ad_hoc_receiving_schema,
)
from ...schemas.supplier import SupplierRead
from .supplier_projection import delivery_counts, product_counts, supplier_to_read
from .supplier_repository import build_supplier_list_query, fetch_supplier_rows

logger = logging.getLogger(__name__)

SUPPLIER_ORM_COLUMNS = (
    "id",
    "tenant_id",
    "name",
    "company_name",
    "tax_id",
    "email",
    "phone",
    "website",
    "country",
    "city",
    "postal_code",
    "street",
    "address",
    "active",
    "default_lead_time_days",
    "default_currency",
    "minimum_order_value",
    "minimum_order_qty",
    "free_shipping_threshold",
    "offers_free_shipping",
    "requires_moq",
    "notes",
    "is_incomplete",
)


class SupplierListQueryError(RuntimeError):
    """Raised when supplier list query fails after optional schema repair."""

    def __init__(self, message: str, *, code: str = "SUPPLIERS_LIST_QUERY_FAILED"):
        super().__init__(message)
        self.message = message
        self.code = code


def _is_missing_column_error(exc: BaseException) -> bool:
    msg = str(exc).lower()
    if "no such column" in msg:
        return True
    if "undefined column" in msg:
        return True
    return "column" in msg and "does not exist" in msg


def ensure_suppliers_orm_schema() -> None:
    """Idempotent — all columns required by ``Supplier`` ORM for list/detail."""
    ensure_supplier_assortment_columns_and_product_default_supplier(engine)
    ensure_manufacturer_supplier_business_entity_columns(engine)
    ensure_supplier_purchasing_columns(engine)
    ensure_wms_ad_hoc_receiving_schema(engine)


def _list_impl(
    db: Session,
    *,
    tenant_id: int,
    name: Optional[str] = None,
    country: Optional[str] = None,
    city: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    currency: Optional[str] = None,
    requires_moq: Optional[bool] = None,
    offers_free_shipping: Optional[bool] = None,
    min_product_count: Optional[int] = None,
    min_delivery_count: Optional[int] = None,
    status: str = "all",
    sort_dir: str = "asc",
) -> List[SupplierRead]:
    query = build_supplier_list_query(
        db,
        tenant_id=int(tenant_id),
        name=name,
        country=country,
        city=city,
        email=email,
        phone=phone,
        currency=currency,
        requires_moq=requires_moq,
        offers_free_shipping=offers_free_shipping,
        status=status,
    )
    rows = fetch_supplier_rows(db, query)
    ids = [row.id for row in rows]
    deliveries = delivery_counts(db, int(tenant_id), ids)
    products = product_counts(db, int(tenant_id), ids)
    out = [
        supplier_to_read(
            row,
            delivery_count=deliveries.get(row.id, 0),
            product_count=products.get(row.id, 0),
        )
        for row in rows
    ]
    if min_product_count is not None:
        out = [item for item in out if item.product_count >= int(min_product_count)]
    if min_delivery_count is not None:
        out = [item for item in out if item.delivery_count >= int(min_delivery_count)]
    reverse = (sort_dir or "asc").strip().lower() == "desc"
    out.sort(key=lambda item: (item.name or "").lower(), reverse=reverse)
    return out


def list_suppliers_for_tenant(
    db: Session,
    *,
    tenant_id: int,
    name: Optional[str] = None,
    country: Optional[str] = None,
    city: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    currency: Optional[str] = None,
    requires_moq: Optional[bool] = None,
    offers_free_shipping: Optional[bool] = None,
    min_product_count: Optional[int] = None,
    min_delivery_count: Optional[int] = None,
    status: str = "all",
    sort_dir: str = "asc",
) -> List[SupplierRead]:
    if tenant_id is None or int(tenant_id) < 1:
        raise ValueError("tenant_id is required")
    try:
        return _list_impl(
            db,
            tenant_id=int(tenant_id),
            name=name,
            country=country,
            city=city,
            email=email,
            phone=phone,
            currency=currency,
            requires_moq=requires_moq,
            offers_free_shipping=offers_free_shipping,
            min_product_count=min_product_count,
            min_delivery_count=min_delivery_count,
            status=status,
            sort_dir=sort_dir,
        )
    except (OperationalError, ProgrammingError) as exc:
        if not _is_missing_column_error(exc):
            raise SupplierListQueryError(
                "Nie udało się wczytać listy dostawców (błąd bazy danych)."
            ) from exc
        db.rollback()
        try:
            ensure_suppliers_orm_schema()
            return _list_impl(
                db,
                tenant_id=int(tenant_id),
                name=name,
                country=country,
                city=city,
                email=email,
                phone=phone,
                currency=currency,
                requires_moq=requires_moq,
                offers_free_shipping=offers_free_shipping,
                min_product_count=min_product_count,
                min_delivery_count=min_delivery_count,
                status=status,
                sort_dir=sort_dir,
            )
        except Exception as retry_exc:
            raise SupplierListQueryError(
                "Nie udało się wczytać listy dostawców. Schemat tabeli suppliers jest nieaktualny — "
                "uruchom migrację bazy lub skontaktuj się z administratorem."
            ) from retry_exc
