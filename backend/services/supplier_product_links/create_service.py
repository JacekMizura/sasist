"""Create supplier_products rows — validation, persistence, error mapping."""

from __future__ import annotations

import json
from typing import List, Optional

from sqlalchemy.exc import IntegrityError, OperationalError, ProgrammingError
from sqlalchemy.orm import Session

from ...database import engine
from ...db.schema_upgrade import (
    ensure_supplier_product_tiers_and_delivery_price_manual_columns,
    ensure_supplier_products_table,
)
from ...models.product import Product
from ...models.supplier import Supplier
from ...models.supplier_product import SupplierProduct
from ...schemas.supplier_product_link import SupplierProductLinkCreateBody
from ...schemas.supplier_products import SupplierCatalogPriceTier
from .db_errors import (
    error_detail,
    is_foreign_key_violation,
    is_not_null_violation,
    is_schema_error,
    is_undefined_column_error,
    is_undefined_table_error,
)
from .errors import SupplierProductLinkError


def tiers_json_from_body(tiers: Optional[List[SupplierCatalogPriceTier]]) -> Optional[str]:
    if tiers is None or len(tiers) == 0:
        return None
    payload = [{"qty_from": float(t.qty_from), "unit_net": float(t.unit_net)} for t in tiers]
    return json.dumps(payload, ensure_ascii=False)


def ensure_supplier_product_links_schema() -> None:
    ensure_supplier_products_table(engine)
    ensure_supplier_product_tiers_and_delivery_price_manual_columns(engine)


def map_supplier_product_link_create_exception(exc: BaseException) -> SupplierProductLinkError:
    if isinstance(exc, SupplierProductLinkError):
        return exc

    detail = error_detail(exc)

    if isinstance(exc, IntegrityError):
        lower = detail.lower()
        if "unique" in lower or "duplicate" in lower or "uq_supplier_products" in lower:
            return SupplierProductLinkError(
                "Ten produkt jest już powiązany z tym dostawcą.",
                code="SUPPLIER_PRODUCT_LINK_DUPLICATE",
                details=detail,
                http_status=409,
            )
        if is_not_null_violation(exc):
            return SupplierProductLinkError(
                "Brakuje wymaganej wartości w powiązaniu produkt–dostawca.",
                code="SUPPLIER_PRODUCT_LINK_NOT_NULL",
                details=detail,
                http_status=400,
            )
        if is_foreign_key_violation(exc):
            return SupplierProductLinkError(
                "Nieprawidłowy dostawca, produkt lub tenant.",
                code="SUPPLIER_PRODUCT_LINK_FK",
                details=detail,
                http_status=400,
            )
        return SupplierProductLinkError(
            "Nie udało się zapisać powiązania produkt–dostawca (konflikt danych).",
            code="SUPPLIER_PRODUCT_LINK_INTEGRITY",
            details=detail,
            http_status=400,
        )

    if isinstance(exc, (OperationalError, ProgrammingError)):
        if is_undefined_table_error(exc):
            return SupplierProductLinkError(
                "Tabela supplier_products nie istnieje — uruchom migrację bazy.",
                code="SUPPLIER_PRODUCT_LINK_UNDEFINED_TABLE",
                details=detail,
                http_status=503,
            )
        if is_undefined_column_error(exc):
            return SupplierProductLinkError(
                "Schemat tabeli supplier_products jest nieaktualny — uruchom migrację bazy.",
                code="SUPPLIER_PRODUCT_LINK_UNDEFINED_COLUMN",
                details=detail,
                http_status=503,
            )
        if is_schema_error(exc):
            return SupplierProductLinkError(
                "Błąd schematu bazy dla powiązań produkt–dostawca.",
                code="SUPPLIER_PRODUCT_LINK_SCHEMA",
                details=detail,
                http_status=503,
            )
        return SupplierProductLinkError(
            "Błąd bazy danych podczas tworzenia powiązania produkt–dostawca.",
            code="SUPPLIER_PRODUCT_LINK_DB",
            details=detail,
            http_status=503,
        )

    return SupplierProductLinkError(
        "Nie udało się utworzyć powiązania produkt–dostawca. Spróbuj ponownie za chwilę.",
        code="SUPPLIER_PRODUCT_LINK_CREATE_FAILED",
        details=detail,
        http_status=503,
    )


def _validate_create_body(db: Session, body: SupplierProductLinkCreateBody) -> None:
    if body.tenant_id < 1:
        raise SupplierProductLinkError(
            "Nieprawidłowy tenant_id.",
            code="SUPPLIER_PRODUCT_LINK_INVALID_TENANT",
            details="tenant_id must be >= 1",
            http_status=400,
        )
    sup = db.query(Supplier).filter(Supplier.id == body.supplier_id, Supplier.tenant_id == body.tenant_id).first()
    if not sup:
        raise SupplierProductLinkError(
            "Nieprawidłowy dostawca dla tenantu.",
            code="SUPPLIER_PRODUCT_LINK_INVALID_SUPPLIER",
            details=f"supplier_id={body.supplier_id} tenant_id={body.tenant_id}",
            http_status=400,
        )
    pr = db.query(Product).filter(Product.id == body.product_id, Product.tenant_id == body.tenant_id).first()
    if not pr:
        raise SupplierProductLinkError(
            "Nieprawidłowy produkt dla tenantu.",
            code="SUPPLIER_PRODUCT_LINK_INVALID_PRODUCT",
            details=f"product_id={body.product_id} tenant_id={body.tenant_id}",
            http_status=400,
        )
    dup = (
        db.query(SupplierProduct)
        .filter(
            SupplierProduct.supplier_id == body.supplier_id,
            SupplierProduct.product_id == body.product_id,
        )
        .first()
    )
    if dup:
        raise SupplierProductLinkError(
            "Ten produkt jest już powiązany z tym dostawcą.",
            code="SUPPLIER_PRODUCT_LINK_DUPLICATE",
            details=f"existing_link_id={dup.id}",
            http_status=409,
        )


def _persist_link(db: Session, body: SupplierProductLinkCreateBody) -> SupplierProduct:
    row = SupplierProduct(
        tenant_id=body.tenant_id,
        supplier_id=body.supplier_id,
        product_id=body.product_id,
        purchase_price=body.purchase_price,
        purchase_price_tiers_json=tiers_json_from_body(body.purchase_price_tiers),
        lead_time_days=body.lead_time_days,
        min_order_qty=body.min_order_qty,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def create_supplier_product_link_for_tenant(db: Session, body: SupplierProductLinkCreateBody) -> SupplierProduct:
    _validate_create_body(db, body)
    try:
        return _persist_link(db, body)
    except (OperationalError, ProgrammingError) as exc:
        if not is_schema_error(exc):
            db.rollback()
            raise map_supplier_product_link_create_exception(exc) from exc
        db.rollback()
        ensure_supplier_product_links_schema()
        try:
            return _persist_link(db, body)
        except Exception as retry_exc:
            db.rollback()
            raise map_supplier_product_link_create_exception(retry_exc) from retry_exc
    except IntegrityError as exc:
        db.rollback()
        raise map_supplier_product_link_create_exception(exc) from exc
    except Exception as exc:
        db.rollback()
        raise map_supplier_product_link_create_exception(exc) from exc
