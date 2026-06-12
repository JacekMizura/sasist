"""Effective offer price — override or Product.sale_price SSOT."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ...models.product import Product
from ...models.product_sales_offer import ProductSalesOffer


def effective_offer_sale_price_net(
    offer: ProductSalesOffer,
    product: Product | None = None,
) -> float | None:
    raw = getattr(offer, "sale_price_net", None)
    if raw is not None:
        try:
            v = float(raw)
            if v >= 0:
                return round(v, 4)
        except (TypeError, ValueError):
            pass
    if product is not None:
        sp = getattr(product, "sale_price", None)
        if sp is not None:
            try:
                return round(float(sp), 4)
            except (TypeError, ValueError):
                pass
    return None


def load_product_for_offer(db: Session, offer: ProductSalesOffer) -> Product | None:
    return (
        db.query(Product)
        .filter(
            Product.id == int(offer.product_id),
            Product.tenant_id == int(offer.tenant_id),
        )
        .first()
    )


def resolve_effective_offer_price(
    db: Session,
    offer: ProductSalesOffer | Any,
) -> float | None:
    product = load_product_for_offer(db, offer)
    return effective_offer_sale_price_net(offer, product)
