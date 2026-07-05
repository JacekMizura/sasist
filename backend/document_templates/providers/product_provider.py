"""Product document provider."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..dto.print_context import ProductPrintContext
from ..errors import DocumentProviderError
from .sample_data import sample_product_context


class ProductProvider:
    def build(self, db: Session, *, tenant_id: int, **params: Any) -> ProductPrintContext:
        if params.get("sample"):
            return sample_product_context()

        product_id = params.get("product_id")
        if product_id is None:
            return sample_product_context()

        from ...models.product import Product

        product = (
            db.query(Product)
            .filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id), Product.deleted_at.is_(None))
            .first()
        )
        if product is None:
            raise DocumentProviderError("Produkt nie istnieje.", code="not_found")

        return ProductPrintContext(
            product={
                "id": int(product.id),
                "name": product.name,
                "sku": product.sku or product.symbol,
                "ean": product.ean,
                "catalog_number": getattr(product, "catalog_number", None),
                "barcode_value": product.ean or product.sku,
                "image": product.image_url,
            },
            manufacturer={"name": getattr(product, "manufacturer_name", None) or "—"},
            stock={"available": str(getattr(product, "stock_quantity", None) or "—")},
            prices={"net": str(getattr(product, "price_net", None) or "—")},
            images=[product.image_url] if product.image_url else [],
        )


product_provider = ProductProvider()
