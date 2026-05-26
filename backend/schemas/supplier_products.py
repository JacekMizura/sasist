"""Enriched supplier catalog rows for purchasing UI."""

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class ManufacturerLinkedOut(BaseModel):
    """Manufacturers that appear on at least one product (or WM producer) linked to this supplier."""

    id: int
    name: str
    active: bool = True


class SupplierCatalogPriceTier(BaseModel):
    """Quantity threshold → negotiated unit net (supplier / WM)."""

    qty_from: float = Field(..., ge=0)
    unit_net: float = Field(..., ge=0)


class SupplierProductCatalogItem(BaseModel):
    """One row in supplier offer: product link and/or warehouse material (carton / packaging)."""

    row_uid: str = Field(..., description="Stable key for UI (e.g. sp:…, ct:…, pk:…)")
    catalog_kind: Literal["product", "carton", "packaging"] = "product"
    id: Optional[int] = Field(None, description="supplier_products.id when catalog_kind=product")
    supplier_id: int
    product_id: Optional[int] = None
    wm_kind: Optional[Literal["carton", "packaging"]] = None
    wm_id: Optional[str] = None
    warehouse_id: Optional[int] = Field(None, description="Source warehouse for WM rows")
    name: str
    sku: Optional[str] = None
    ean: Optional[str] = None
    image_url: Optional[str] = None
    purchase_price: Optional[float] = None
    #: Quantity tiers (same rules as purchase orders). ``purchase_price`` is list unit at qty 1 when tiers exist.
    price_tiers: List[SupplierCatalogPriceTier] = Field(default_factory=list)
    lead_time_days: Optional[int] = None
    min_order_qty: Optional[float] = None
    purchase_pack_qty: Optional[float] = Field(None, description="Wielopak / zbiorcze opakowanie u dostawcy")
    free_shipping_threshold_net: Optional[float] = Field(None, description="Próg darmowej dostawy netto u dostawcy (materiał)")
    vat_rate: float = Field(23.0, description="VAT % — z produktu lub z karty WM")
    is_default_supplier: bool = False
    manufacturer_id: Optional[int] = Field(default=None, description="Producent / marka (produkt lub WM)")
    manufacturer_name: Optional[str] = Field(default=None, description="Nazwa producenta z katalogu")
    stock_on_hand: Optional[float] = Field(
        default=None, description="Widoczny stan magazynowy (suma inventory dla produktu; stan WM dla kartonu/materiału)"
    )
    stock_reserved: Optional[float] = Field(
        default=None, description="Suma rezerwacji (produkt) lub reserved_qty (WM)"
    )
