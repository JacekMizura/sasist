from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


DELIVERY_STATUSES = frozenset({"draft", "ordered", "in_transit", "received", "cancelled"})


class DeliveryItemRead(BaseModel):
    id: int
    delivery_id: int
    product_id: Optional[int] = None
    wm_kind: Optional[Literal["carton", "packaging"]] = None
    wm_id: Optional[str] = None
    wm_name: Optional[str] = None
    product_name: Optional[str] = None
    product_symbol: Optional[str] = None
    product_ean: Optional[str] = None
    product_image_url: Optional[str] = None
    #: Resolved title for any line type (never ``Produkt #null``).
    display_name: str = "Pozycja usunięta"
    line_item_type: Optional[str] = None
    line_item_ref_id: Optional[str] = None
    item_name: Optional[str] = None
    item_sku: Optional[str] = None
    item_ean: Optional[str] = None
    item_unit: Optional[str] = None
    source_label: Optional[str] = None
    display_sku: Optional[str] = None
    display_ean: Optional[str] = None
    quantity_ordered: float
    quantity_received: float
    purchase_price: Optional[float] = None
    purchase_price_net: Optional[float] = None
    vat_rate: float = 23.0
    line_total_value: float = 0.0
    line_total_net: float = 0.0
    line_vat_amount: float = 0.0
    line_total_gross: float = 0.0
    purchase_price_manual: bool = False
    #: Tier hint for current qty when not manual (e.g. "Próg cenowy: od 1000 szt." / "Cena bazowa").
    pricing_hint: Optional[str] = None
    #: When unit price is missing.
    pricing_warning: Optional[str] = None
    #: Unit net at qty 1 for savings vs list (tier or base); independent of line qty.
    catalog_compare_unit_net: Optional[float] = None


class DeliveryItemCreateBody(BaseModel):
    product_id: Optional[int] = Field(None, ge=1)
    wm_kind: Optional[Literal["carton", "packaging"]] = None
    wm_id: Optional[str] = Field(None, max_length=36)
    quantity_ordered: float = Field(..., gt=0)
    purchase_price: Optional[float] = Field(None, ge=0)
    #: When True, ``purchase_price`` is required and quantity changes will not overwrite it.
    purchase_price_manual: bool = False

    @model_validator(mode="after")
    def _one_line_target(self) -> "DeliveryItemCreateBody":
        has_p = self.product_id is not None
        has_wm = self.wm_kind is not None and (self.wm_id or "").strip() != ""
        if has_p and has_wm:
            raise ValueError("Podaj albo product_id, albo materiał magazynowy (wm_kind + wm_id), nie oba naraz.")
        if not has_p and not has_wm:
            raise ValueError("Podaj product_id albo wm_kind + wm_id (kartony / materiały pakowe).")
        if self.purchase_price_manual and self.purchase_price is None:
            raise ValueError("Przy cenie ręcznej podaj purchase_price.")
        return self


class DeliveryItemPatchBody(BaseModel):
    quantity_ordered: Optional[float] = Field(None, gt=0)
    purchase_price: Optional[float] = Field(
        default=None,
        description="Send null to clear price; omit field to leave unchanged.",
    )
    #: When True, re-apply tier/catalog price for current qty and clear manual override.
    restore_catalog_price: Optional[bool] = Field(
        default=None,
        description="Set true to recalculate from supplier tiers and clear manual price.",
    )

    @field_validator("purchase_price")
    @classmethod
    def purchase_price_non_negative(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v < 0:
            raise ValueError("purchase_price must be >= 0")
        return v


class DeliveryRead(BaseModel):
    id: int
    tenant_id: int
    supplier_id: int
    supplier_name: str
    warehouse_id: Optional[int] = None
    warehouse_name: Optional[str] = None
    name: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime
    expected_date: Optional[datetime] = None
    received_at: Optional[datetime] = None
    notes: Optional[str] = None
    item_count: int = 0
    total_value: float = 0.0
    total_net: float = 0.0
    total_vat: float = 0.0
    total_gross: float = 0.0
    items: List[DeliveryItemRead] = Field(default_factory=list)


class DeliveryListRow(BaseModel):
    id: int
    tenant_id: int
    supplier_id: int
    supplier_name: str
    warehouse_id: Optional[int] = None
    name: Optional[str] = None
    status: str
    created_at: datetime
    expected_date: Optional[datetime] = None
    received_at: Optional[datetime] = None
    item_count: int = 0
    #: Legacy: sum of qty × net unit (same as total_net when lines have prices).
    total_value: float = 0.0
    total_net: float = 0.0
    total_vat: float = 0.0
    total_gross: float = 0.0
    items_preview: List[str] = Field(default_factory=list)


class DeliveryCreateBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    supplier_id: int = Field(..., ge=1)
    warehouse_id: Optional[int] = Field(None, ge=1)
    name: Optional[str] = Field(None, max_length=512)
    status: str = "draft"
    expected_date: Optional[datetime] = None
    notes: Optional[str] = None

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: str) -> str:
        s = (v or "draft").strip().lower()
        if s not in DELIVERY_STATUSES:
            raise ValueError(f"invalid status: {v}")
        if s in ("received", "cancelled"):
            raise ValueError("cannot create delivery in received or cancelled state")
        return s


class DeliveryUpdateBody(BaseModel):
    supplier_id: Optional[int] = Field(None, ge=1)
    warehouse_id: Optional[int] = Field(None, ge=1)
    name: Optional[str] = Field(None, max_length=512)
    status: Optional[str] = None
    expected_date: Optional[datetime] = None
    notes: Optional[str] = None

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip().lower()
        if s not in DELIVERY_STATUSES:
            raise ValueError(f"invalid status: {v}")
        return s


class QuickFromProductBody(BaseModel):
    """Create a draft purchase order (delivery) with a single line from catalog product (Assortment — no inventory)."""

    tenant_id: int = Field(..., ge=1)
    product_id: int = Field(..., ge=1)
    supplier_id: Optional[int] = Field(None, ge=1)
    quantity: float = Field(1, gt=0)
