"""Resolve active offers for OMS / POS / order lines."""

from __future__ import annotations

from typing import Sequence

from sqlalchemy.orm import Session

from ...models.product_sales_offer import ProductSalesOffer
from ..stock_disposition import DEFAULT_STOCK_DISPOSITION, assert_reservable_disposition, normalize_stock_disposition
from .errors import ProductSalesOfferError


def _active_offers_query(db: Session, *, tenant_id: int, product_id: int):
    return (
        db.query(ProductSalesOffer)
        .filter(
            ProductSalesOffer.tenant_id == int(tenant_id),
            ProductSalesOffer.product_id == int(product_id),
            ProductSalesOffer.active.is_(True),
            ProductSalesOffer.deleted_at.is_(None),
        )
        .order_by(
            ProductSalesOffer.is_default.desc(),
            ProductSalesOffer.stock_disposition.asc(),
            ProductSalesOffer.id.asc(),
        )
    )


def list_active_offers_for_product(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
) -> list[ProductSalesOffer]:
    return _active_offers_query(db, tenant_id=tenant_id, product_id=product_id).all()


def get_default_offer_for_product(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
) -> ProductSalesOffer | None:
    row = (
        _active_offers_query(db, tenant_id=tenant_id, product_id=product_id)
        .filter(ProductSalesOffer.is_default.is_(True))
        .first()
    )
    if row is not None:
        return row
    return (
        _active_offers_query(db, tenant_id=tenant_id, product_id=product_id)
        .filter(ProductSalesOffer.stock_disposition == DEFAULT_STOCK_DISPOSITION)
        .first()
    )


def get_offer_by_id(
    db: Session,
    *,
    offer_id: int,
    tenant_id: int,
) -> ProductSalesOffer | None:
    return (
        db.query(ProductSalesOffer)
        .filter(
            ProductSalesOffer.id == int(offer_id),
            ProductSalesOffer.tenant_id == int(tenant_id),
            ProductSalesOffer.deleted_at.is_(None),
        )
        .first()
    )


def auto_select_offer_if_unique(offers: Sequence[ProductSalesOffer]) -> ProductSalesOffer | None:
    active = [o for o in offers if bool(getattr(o, "active", True))]
    if len(active) == 1:
        return active[0]
    return None


def resolve_offer_for_order_line(
    db: Session,
    *,
    tenant_id: int,
    offer_id: int | None = None,
    product_id: int | None = None,
) -> ProductSalesOffer:
    if offer_id is not None and int(offer_id) > 0:
        row = get_offer_by_id(db, offer_id=int(offer_id), tenant_id=int(tenant_id))
        if row is None or not row.active:
            raise ProductSalesOfferError("Oferta nie istnieje lub jest nieaktywna.", code="offer_not_found")
        return row
    if product_id is not None and int(product_id) > 0:
        row = get_default_offer_for_product(db, tenant_id=int(tenant_id), product_id=int(product_id))
        if row is None:
            raise ProductSalesOfferError(
                "Brak domyślnej oferty dla produktu — uruchom backfill ofert.",
                code="default_offer_missing",
            )
        return row
    raise ProductSalesOfferError("Wymagane offer_id lub product_id.", code="offer_ref_missing")


def validate_new_offer_disposition(stock_disposition: str) -> str:
    return assert_reservable_disposition(stock_disposition)


def disposition_for_offer(offer: ProductSalesOffer) -> str:
    return normalize_stock_disposition(getattr(offer, "stock_disposition", None))
