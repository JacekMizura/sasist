from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

BundleOperationalMode = Literal["ON_DEMAND_ASSEMBLY", "STOCK_PRODUCTION"]
# Legacy — synced internally; do not use in new UI.
BundleFulfillmentMode = Literal["assembly", "manufacturing"]
BundleStockMode = Literal["physical", "virtual"]


class BundleItemRead(BaseModel):
    id: int
    product_id: int
    quantity: int = Field(..., ge=1)
    sort_order: int = 0
    product_name: Optional[str] = None
    product_sku: Optional[str] = None
    """SUM(inventory.quantity) for this product in tenant; for UI tooltips / breakdown."""
    product_stock: Optional[int] = None
    """Koszt zakupu netto składnika (z product_cost_service)."""
    product_purchase_price: Optional[float] = None
    #: Import CSV — dodatkowe pola składnika (JSON).
    metadata_json: Optional[str] = None

    class Config:
        from_attributes = True


class BundleBrief(BaseModel):
    id: int
    name: str
    sku: Optional[str] = None
    ean: Optional[str] = None

    class Config:
        from_attributes = True


class BundleRead(BaseModel):
    id: int
    tenant_id: int
    name: str
    sku: Optional[str] = None
    ean: Optional[str] = None
    sale_price: Optional[float] = None
    extra_cost_packaging_net: float = 0.0
    production_cost_net: float = 0.0
    purchase_cost: Optional[float] = None
    materials_cost: Optional[float] = None
    packaging_cost: Optional[float] = None
    production_cost: Optional[float] = None
    total_cost: Optional[float] = None
    selling_price_net: Optional[float] = None
    selling_price_gross: Optional[float] = None
    margin_value: Optional[float] = None
    margin_percent: Optional[float] = None
    active: bool = True
    image_url: Optional[str] = None
    length_mm: Optional[float] = None
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    weight_kg: Optional[float] = None
    metadata_json: Optional[str] = None
    bundle_fulfillment_mode: BundleOperationalMode = "ON_DEMAND_ASSEMBLY"
    fulfillment_mode: BundleFulfillmentMode = "assembly"
    stock_mode: BundleStockMode = "virtual"
    linked_product_id: Optional[int] = None
    """Stan magazynowy powiązanego produktu (physical) lub None."""
    physical_stock: Optional[int] = None
    """min(floor(product_stock / required_qty)) over components; None if bundle has no lines."""
    calculated_stock: Optional[int] = None
    items: List[BundleItemRead] = Field(default_factory=list)

    class Config:
        from_attributes = True


class BundleItemWrite(BaseModel):
    product_id: int = Field(..., ge=1)
    quantity: int = Field(..., ge=1)
    sort_order: int = 0


class BundleCreateBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    name: str = Field(..., min_length=1)
    sku: Optional[str] = None
    ean: Optional[str] = None
    sale_price: Optional[float] = None
    extra_cost_packaging_net: float = 0.0
    production_cost_net: float = 0.0
    active: bool = True
    image_url: Optional[str] = None
    length_mm: Optional[float] = None
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    weight_kg: Optional[float] = None
    metadata_json: Optional[str] = None
    bundle_fulfillment_mode: BundleOperationalMode = "ON_DEMAND_ASSEMBLY"
    fulfillment_mode: BundleFulfillmentMode = "assembly"
    stock_mode: BundleStockMode = "virtual"
    #: B1 — ustawiane automatycznie przez backend; ignorowane w POST/PUT z UI
    linked_product_id: Optional[int] = Field(None, ge=1)
    items: List[BundleItemWrite] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("name is required")
        return s


class BundleUpdateBody(BaseModel):
    name: str = Field(..., min_length=1)
    sku: Optional[str] = None
    ean: Optional[str] = None
    sale_price: Optional[float] = None
    extra_cost_packaging_net: float = 0.0
    production_cost_net: float = 0.0
    active: bool = True
    image_url: Optional[str] = None
    length_mm: Optional[float] = None
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    weight_kg: Optional[float] = None
    metadata_json: Optional[str] = None
    bundle_fulfillment_mode: BundleOperationalMode = "ON_DEMAND_ASSEMBLY"
    fulfillment_mode: BundleFulfillmentMode = "assembly"
    stock_mode: BundleStockMode = "virtual"
    #: B1 — ignorowane w PUT z UI
    linked_product_id: Optional[int] = Field(None, ge=1)
    items: List[BundleItemWrite] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("name is required")
        return s


class BundleExpandLine(BaseModel):
    product_id: int
    product_name: Optional[str] = None
    sku: Optional[str] = None
    quantity: int


class BundleExpandResponse(BaseModel):
    bundle_id: int
    bundle_name: str
    quantity: int
    lines: List[BundleExpandLine]


class BundleBulkDeleteBody(BaseModel):
    """POST /bundles/bulk-delete."""

    tenant_id: int = Field(..., ge=1)
    ids: List[int] = Field(..., min_length=1)
