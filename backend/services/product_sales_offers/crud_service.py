"""Create / update product sales offers (Etap 3A minimal)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from ...models.product import Product
from ...models.product_sales_offer import ProductSalesOffer
from ..stock_disposition import DEFAULT_STOCK_DISPOSITION, STOCK_DISPOSITION_OUTLET_B
from .errors import ProductSalesOfferError
from .price_service import effective_offer_sale_price_net
from .resolution_service import get_default_offer_for_product, validate_new_offer_disposition


def ensure_default_offer_for_product(
    db: Session,
    *,
    product: Product,
    name: str | None = None,
) -> ProductSalesOffer:
    existing = get_default_offer_for_product(
        db, tenant_id=int(product.tenant_id), product_id=int(product.id)
    )
    if existing is not None:
        return existing
    offer = ProductSalesOffer(
        tenant_id=int(product.tenant_id),
        product_id=int(product.id),
        stock_disposition=DEFAULT_STOCK_DISPOSITION,
        name=(name or product.name or f"Produkt #{product.id}").strip()[:512],
        sale_price_net=None,
        is_default=True,
        active=True,
    )
    db.add(offer)
    db.flush()
    return offer


def create_outlet_offer_preset(
    db: Session,
    *,
    product: Product,
) -> ProductSalesOffer:
    sd = validate_new_offer_disposition(STOCK_DISPOSITION_OUTLET_B)
    dup = (
        db.query(ProductSalesOffer)
        .filter(
            ProductSalesOffer.tenant_id == int(product.tenant_id),
            ProductSalesOffer.product_id == int(product.id),
            ProductSalesOffer.stock_disposition == sd,
            ProductSalesOffer.deleted_at.is_(None),
            ProductSalesOffer.active.is_(True),
        )
        .first()
    )
    if dup is not None:
        raise ProductSalesOfferError(
            f"Aktywna oferta dla puli {sd} już istnieje (id={int(dup.id)}).",
            code="offer_disposition_exists",
        )
    base_name = (product.name or f"Produkt #{product.id}").strip()
    offer = ProductSalesOffer(
        tenant_id=int(product.tenant_id),
        product_id=int(product.id),
        stock_disposition=sd,
        name=f"{base_name} — Outlet"[:512],
        sale_price_net=None,
        is_default=False,
        active=True,
    )
    db.add(offer)
    db.flush()
    return offer


def update_offer(
    db: Session,
    *,
    offer: ProductSalesOffer,
    name: str | None = None,
    sale_price_net: Any | None = ...,  # type: ignore[assignment]
    active: bool | None = None,
) -> ProductSalesOffer:
    if name is not None:
        n = str(name).strip()
        if not n:
            raise ProductSalesOfferError("Nazwa oferty nie może być pusta.")
        offer.name = n[:512]
    if sale_price_net is not ...:
        if sale_price_net is None:
            offer.sale_price_net = None
        else:
            try:
                v = float(sale_price_net)
            except (TypeError, ValueError) as exc:
                raise ProductSalesOfferError("Nieprawidłowa cena oferty.") from exc
            if v < 0:
                raise ProductSalesOfferError("Cena oferty nie może być ujemna.")
            offer.sale_price_net = Decimal(str(round(v, 2)))
    if active is not None:
        if offer.is_default and not active:
            raise ProductSalesOfferError("Nie można dezaktywować domyślnej oferty standardowej.")
        offer.active = bool(active)
    offer.updated_at = datetime.utcnow()
    db.flush()
    return offer


def soft_delete_offer(db: Session, offer: ProductSalesOffer) -> None:
    if offer.is_default:
        raise ProductSalesOfferError("Nie można usunąć domyślnej oferty standardowej.")
    offer.active = False
    offer.deleted_at = datetime.utcnow()
    db.flush()


def offer_to_read_dict(
    db: Session,
    *,
    offer: ProductSalesOffer,
    product: Product | None,
    available_qty: float,
) -> dict[str, Any]:
    eff = effective_offer_sale_price_net(offer, product)
    return {
        "id": int(offer.id),
        "product_id": int(offer.product_id),
        "stock_disposition": str(offer.stock_disposition),
        "name": str(offer.name),
        "sale_price_net": float(offer.sale_price_net) if offer.sale_price_net is not None else None,
        "effective_sale_price_net": eff,
        "is_default": bool(offer.is_default),
        "active": bool(offer.active),
        "available_qty": round(float(available_qty), 4),
        "uses_product_price": offer.sale_price_net is None,
    }
