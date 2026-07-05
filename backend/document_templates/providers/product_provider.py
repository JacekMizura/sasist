"""Product document provider."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..dto.print_context import ProductPrintContext
from ..errors import DocumentProviderError
from .sample_data import sample_product_context


def _manufacturer_name(db: Session, product) -> str:
    legacy = str(getattr(product, "manufacturer", None) or "").strip()
    if legacy:
        return legacy
    mid = getattr(product, "manufacturer_id", None)
    if mid is None:
        return "—"
    from ...models.manufacturer import Manufacturer

    row = (
        db.query(Manufacturer)
        .filter(Manufacturer.id == int(mid), Manufacturer.tenant_id == int(product.tenant_id))
        .first()
    )
    if row is None:
        return "—"
    return str(row.name or "").strip() or "—"


def _price_strings(product) -> dict[str, str]:
    sale = getattr(product, "sale_price", None)
    purchase = getattr(product, "purchase_price", None)
    net = float(sale) if sale is not None else None
    gross = round(net * 1.23, 2) if net is not None else None
    return {
        "net": f"{net:.2f}" if net is not None else "—",
        "gross": f"{gross:.2f}" if gross is not None else "—",
        "purchase": f"{float(purchase):.2f}" if purchase is not None else "—",
    }


class ProductProvider:
    def build(self, db: Session, *, tenant_id: int, **params: Any) -> ProductPrintContext:
        if params.get("sample"):
            return sample_product_context()

        product_id = params.get("product_id")
        if product_id is None:
            return sample_product_context()

        from ...models.product import Product
        from ...services.product_inventory_display_service import get_product_inventory_display_snapshot

        product = (
            db.query(Product)
            .filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id), Product.deleted_at.is_(None))
            .first()
        )
        if product is None:
            raise DocumentProviderError("Produkt nie istnieje.", code="not_found")

        inv = get_product_inventory_display_snapshot(
            db,
            product_id=int(product.id),
            tenant_id=int(tenant_id),
        )
        prices = _price_strings(product)
        display_name = str(product.name or "").strip() or str(product.sku or product.symbol or f"Produkt #{product.id}")
        sku = str(product.sku or product.symbol or "").strip() or None

        return ProductPrintContext(
            title="Karta produktu",
            document_number=sku or str(product.id),
            product={
                "id": int(product.id),
                "name": display_name,
                "sku": sku,
                "ean": product.ean,
                "catalog_number": getattr(product, "catalog_number", None),
                "barcode_value": product.ean or product.barcode or sku,
                "image": product.image_url,
                "unit": getattr(product, "unit", None) or "szt.",
            },
            manufacturer={"name": _manufacturer_name(db, product)},
            stock={
                "available": str(int(inv.get("available_quantity") or 0)),
                "reserved": str(int(inv.get("reserved_quantity") or 0)),
                "on_hand": str(int(inv.get("stock_quantity") or 0)),
            },
            prices=prices,
            images=[product.image_url] if product.image_url else [],
        )


product_provider = ProductProvider()
