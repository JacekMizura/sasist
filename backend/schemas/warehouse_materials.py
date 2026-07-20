"""Cartons + packaging consumables (API schemas)."""

from __future__ import annotations

import math
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from ..services.wm_pricing import complete_package_totals, unit_prices_from_package


def _optional_package_qty_before(v: object) -> object:
    """Treat 0 / empty as unset so ``gt=0`` does not reject legacy rows (optional package size)."""
    if v is None:
        return None
    if isinstance(v, str) and not str(v).strip():
        return None
    try:
        x = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return v
    if not math.isfinite(x):
        return v
    if x <= 0:
        return None
    return x


class ShippingMethodMini(BaseModel):
    id: str
    name: str
    code: str
    logo_url: Optional[str] = None


class PriceTierIn(BaseModel):
    qty_from: float = Field(default=1, ge=0)
    package_qty: Optional[float] = Field(None, gt=0)
    package_net_total: Optional[float] = Field(None, ge=0)
    package_gross_total: Optional[float] = Field(None, ge=0)

    @field_validator("package_qty", mode="before")
    @classmethod
    def _tier_package_qty_coerce(cls, v: object) -> object:
        return _optional_package_qty_before(v)


class PriceTierRead(BaseModel):
    id: str
    sort_index: int
    qty_from: float
    package_qty: Optional[float] = None
    package_net_total: Optional[float] = None
    package_gross_total: Optional[float] = None
    unit_net: Optional[float] = None
    unit_gross: Optional[float] = None
    discount_pct: Optional[float] = None


class CartonRead(BaseModel):
    id: str
    tenant_id: int
    warehouse_id: int
    name: str
    image_url: Optional[str] = None
    sku: Optional[str] = None
    ean: Optional[str] = None
    material_type: Optional[str] = None
    length_cm: float
    width_cm: float
    height_cm: float
    internal_length_cm: Optional[float] = None
    internal_width_cm: Optional[float] = None
    internal_height_cm: Optional[float] = None
    max_payload_kg: Optional[float] = None
    weight_kg: float
    is_active: bool
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    producer_id: Optional[int] = None
    producer_name: Optional[str] = None
    supplier_name_override: Optional[str] = None
    lead_time_days: Optional[int] = None
    moq: Optional[float] = None
    purchase_pack_qty: Optional[float] = None
    free_shipping_threshold_net: Optional[float] = None
    last_purchase_price_net: Optional[float] = None
    supplier_sku: Optional[str] = None
    stock: float = 0
    reserved_qty: float = 0
    available_qty: float = 0
    location_label: Optional[str] = None
    purchase_price: Optional[float] = None
    unit_cost: Optional[float] = None
    vat_rate_pct: float = 23.0
    package_qty: Optional[float] = None
    package_net_total: Optional[float] = None
    package_gross_total: Optional[float] = None
    unit_net_price: Optional[float] = None
    unit_gross_price: Optional[float] = None
    low_stock_threshold: Optional[float] = None
    reorder_qty: Optional[float] = None
    plastic_kg_per_unit: float = 0.0
    paper_kg_per_unit: float = 0.0
    wood_kg_per_unit: float = 0.0
    glass_kg_per_unit: float = 0.0
    metal_kg_per_unit: float = 0.0
    packaging_type: Optional[str] = None
    include_in_bdo: bool = False
    shipping_method_ids: List[str] = Field(default_factory=list)
    shipping_methods: List[ShippingMethodMini] = Field(default_factory=list)
    price_tiers: List[PriceTierRead] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CartonCreate(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: int = Field(..., ge=1)
    name: str = Field(..., min_length=1, max_length=256)
    image_url: Optional[str] = Field(None, max_length=512)
    sku: Optional[str] = Field(None, max_length=128)
    ean: Optional[str] = Field(None, max_length=64)
    material_type: Optional[str] = Field(None, max_length=128)
    length_cm: float = Field(..., gt=0)
    width_cm: float = Field(..., gt=0)
    height_cm: float = Field(..., gt=0)
    internal_length_cm: Optional[float] = Field(None, gt=0)
    internal_width_cm: Optional[float] = Field(None, gt=0)
    internal_height_cm: Optional[float] = Field(None, gt=0)
    max_payload_kg: Optional[float] = Field(None, gt=0)
    weight_kg: float = Field(default=0, ge=0)
    is_active: bool = True
    supplier_id: Optional[int] = None
    producer_id: Optional[int] = None
    supplier_name_override: Optional[str] = Field(None, max_length=256)
    lead_time_days: Optional[int] = Field(None, ge=0)
    moq: Optional[float] = Field(None, ge=0)
    purchase_pack_qty: Optional[float] = Field(None, gt=0)
    free_shipping_threshold_net: Optional[float] = Field(None, ge=0)
    last_purchase_price_net: Optional[float] = Field(None, ge=0)
    supplier_sku: Optional[str] = Field(None, max_length=128)
    stock: float = Field(default=0, ge=0)
    reserved_qty: float = Field(default=0, ge=0)
    location_label: Optional[str] = Field(None, max_length=512)
    purchase_price: Optional[float] = Field(None, ge=0)
    unit_cost: Optional[float] = Field(None, ge=0)
    vat_rate_pct: float = Field(default=23, ge=0, le=100)
    package_qty: Optional[float] = Field(None, gt=0)
    package_net_total: Optional[float] = Field(None, ge=0)
    package_gross_total: Optional[float] = Field(None, ge=0)
    low_stock_threshold: Optional[float] = Field(None, ge=0)
    reorder_qty: Optional[float] = Field(None, ge=0)
    plastic_kg_per_unit: Optional[float] = Field(None, ge=0)
    paper_kg_per_unit: Optional[float] = Field(None, ge=0)
    wood_kg_per_unit: Optional[float] = Field(None, ge=0)
    glass_kg_per_unit: Optional[float] = Field(None, ge=0)
    metal_kg_per_unit: Optional[float] = Field(None, ge=0)
    packaging_type: Optional[str] = Field(None, max_length=64)
    include_in_bdo: bool = False
    shipping_method_ids: List[str] = Field(default_factory=list)
    price_tiers: List[PriceTierIn] = Field(default_factory=list)

    @field_validator("package_qty", mode="before")
    @classmethod
    def _carton_create_package_qty_coerce(cls, v: object) -> object:
        return _optional_package_qty_before(v)


class CartonUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=256)
    image_url: Optional[str] = Field(None, max_length=512)
    sku: Optional[str] = Field(None, max_length=128)
    ean: Optional[str] = Field(None, max_length=64)
    material_type: Optional[str] = Field(None, max_length=128)
    length_cm: Optional[float] = Field(None, gt=0)
    width_cm: Optional[float] = Field(None, gt=0)
    height_cm: Optional[float] = Field(None, gt=0)
    internal_length_cm: Optional[float] = Field(None, gt=0)
    internal_width_cm: Optional[float] = Field(None, gt=0)
    internal_height_cm: Optional[float] = Field(None, gt=0)
    max_payload_kg: Optional[float] = Field(None, gt=0)
    weight_kg: Optional[float] = Field(None, ge=0)
    is_active: Optional[bool] = None
    supplier_id: Optional[int] = None
    producer_id: Optional[int] = None
    supplier_name_override: Optional[str] = Field(None, max_length=256)
    lead_time_days: Optional[int] = Field(None, ge=0)
    moq: Optional[float] = Field(None, ge=0)
    purchase_pack_qty: Optional[float] = Field(None, gt=0)
    free_shipping_threshold_net: Optional[float] = Field(None, ge=0)
    last_purchase_price_net: Optional[float] = Field(None, ge=0)
    supplier_sku: Optional[str] = Field(None, max_length=128)
    stock: Optional[float] = Field(None, ge=0)
    reserved_qty: Optional[float] = Field(None, ge=0)
    location_label: Optional[str] = Field(None, max_length=512)
    purchase_price: Optional[float] = Field(None, ge=0)
    unit_cost: Optional[float] = Field(None, ge=0)
    vat_rate_pct: Optional[float] = Field(None, ge=0, le=100)
    package_qty: Optional[float] = Field(None, gt=0)
    package_net_total: Optional[float] = Field(None, ge=0)
    package_gross_total: Optional[float] = Field(None, ge=0)
    low_stock_threshold: Optional[float] = Field(None, ge=0)
    reorder_qty: Optional[float] = Field(None, ge=0)
    plastic_kg_per_unit: Optional[float] = Field(None, ge=0)
    paper_kg_per_unit: Optional[float] = Field(None, ge=0)
    wood_kg_per_unit: Optional[float] = Field(None, ge=0)
    glass_kg_per_unit: Optional[float] = Field(None, ge=0)
    metal_kg_per_unit: Optional[float] = Field(None, ge=0)
    packaging_type: Optional[str] = Field(None, max_length=64)
    include_in_bdo: Optional[bool] = None
    shipping_method_ids: Optional[List[str]] = None
    price_tiers: Optional[List[PriceTierIn]] = None

    @field_validator("package_qty", mode="before")
    @classmethod
    def _carton_update_package_qty_coerce(cls, v: object) -> object:
        return _optional_package_qty_before(v)


class PackagingMaterialRead(BaseModel):
    id: str
    tenant_id: int
    warehouse_id: int
    name: str
    material_type: str
    unit: str
    image_url: Optional[str] = None
    sku: Optional[str] = None
    stock: float
    reserved_qty: float = 0
    available_qty: float = 0
    is_active: bool
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    producer_id: Optional[int] = None
    producer_name: Optional[str] = None
    supplier_name_override: Optional[str] = None
    lead_time_days: Optional[int] = None
    moq: Optional[float] = None
    purchase_pack_qty: Optional[float] = None
    free_shipping_threshold_net: Optional[float] = None
    last_purchase_price_net: Optional[float] = None
    supplier_sku: Optional[str] = None
    location_label: Optional[str] = None
    purchase_price: Optional[float] = None
    unit_cost: Optional[float] = None
    vat_rate_pct: float = 23.0
    package_qty: Optional[float] = None
    package_net_total: Optional[float] = None
    package_gross_total: Optional[float] = None
    unit_net_price: Optional[float] = None
    unit_gross_price: Optional[float] = None
    low_stock_threshold: Optional[float] = None
    reorder_qty: Optional[float] = None
    notes: Optional[str] = None
    width_mm: Optional[float] = None
    length_m: Optional[float] = None
    thickness_micron: Optional[float] = None
    color: Optional[str] = None
    net_weight_foil_kg: Optional[float] = None
    tube_weight_kg: Optional[float] = None
    stretch_percent: Optional[float] = None
    tube_diameter_mm: Optional[float] = None
    adhesive_type: Optional[str] = None
    tape_weight_kg: Optional[float] = None
    core_paper_weight_kg: Optional[float] = None
    roll_diameter_mm: Optional[float] = None
    grammage_gsm: Optional[float] = None
    paper_type: Optional[str] = None
    roll_weight_kg: Optional[float] = None
    bubble_width_cm: Optional[float] = None
    bubble_diameter_mm: Optional[float] = None
    tolerance_percent: Optional[float] = None
    bubble_weight_kg: Optional[float] = None
    plastic_kg_per_unit: float = 0.0
    paper_kg_per_unit: float = 0.0
    wood_kg_per_unit: float = 0.0
    glass_kg_per_unit: float = 0.0
    metal_kg_per_unit: float = 0.0
    packaging_type: Optional[str] = None
    include_in_bdo: bool = False
    price_tiers: List[PriceTierRead] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class PackagingMaterialCreate(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: int = Field(..., ge=1)
    name: str = Field(..., min_length=1, max_length=256)
    material_type: str = Field(..., min_length=1, max_length=32)
    unit: str = Field(..., min_length=1, max_length=32)
    image_url: Optional[str] = Field(None, max_length=512)
    sku: Optional[str] = Field(None, max_length=128)
    stock: float = Field(default=0, ge=0)
    reserved_qty: float = Field(default=0, ge=0)
    is_active: bool = True
    supplier_id: Optional[int] = None
    producer_id: Optional[int] = None
    supplier_name_override: Optional[str] = Field(None, max_length=256)
    lead_time_days: Optional[int] = Field(None, ge=0)
    moq: Optional[float] = Field(None, ge=0)
    purchase_pack_qty: Optional[float] = Field(None, gt=0)
    free_shipping_threshold_net: Optional[float] = Field(None, ge=0)
    last_purchase_price_net: Optional[float] = Field(None, ge=0)
    supplier_sku: Optional[str] = Field(None, max_length=128)
    location_label: Optional[str] = Field(None, max_length=512)
    purchase_price: Optional[float] = Field(None, ge=0)
    unit_cost: Optional[float] = Field(None, ge=0)
    vat_rate_pct: float = Field(default=23, ge=0, le=100)
    package_qty: Optional[float] = Field(None, gt=0)
    package_net_total: Optional[float] = Field(None, ge=0)
    package_gross_total: Optional[float] = Field(None, ge=0)
    low_stock_threshold: Optional[float] = Field(None, ge=0)
    reorder_qty: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None
    width_mm: Optional[float] = None
    length_m: Optional[float] = None
    thickness_micron: Optional[float] = None
    color: Optional[str] = None
    net_weight_foil_kg: Optional[float] = None
    tube_weight_kg: Optional[float] = None
    stretch_percent: Optional[float] = None
    tube_diameter_mm: Optional[float] = None
    adhesive_type: Optional[str] = None
    tape_weight_kg: Optional[float] = None
    core_paper_weight_kg: Optional[float] = None
    roll_diameter_mm: Optional[float] = None
    grammage_gsm: Optional[float] = None
    paper_type: Optional[str] = None
    roll_weight_kg: Optional[float] = None
    bubble_width_cm: Optional[float] = None
    bubble_diameter_mm: Optional[float] = None
    tolerance_percent: Optional[float] = None
    bubble_weight_kg: Optional[float] = None
    plastic_kg_per_unit: float = Field(default=0, ge=0)
    paper_kg_per_unit: float = Field(default=0, ge=0)
    wood_kg_per_unit: float = Field(default=0, ge=0)
    glass_kg_per_unit: float = Field(default=0, ge=0)
    metal_kg_per_unit: float = Field(default=0, ge=0)
    packaging_type: Optional[str] = Field(None, max_length=64)
    include_in_bdo: bool = False
    price_tiers: List[PriceTierIn] = Field(default_factory=list)

    @field_validator("package_qty", mode="before")
    @classmethod
    def _packaging_create_package_qty_coerce(cls, v: object) -> object:
        return _optional_package_qty_before(v)


class PackagingMaterialUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=256)
    material_type: Optional[str] = Field(None, min_length=1, max_length=32)
    unit: Optional[str] = Field(None, min_length=1, max_length=32)
    image_url: Optional[str] = Field(None, max_length=512)
    sku: Optional[str] = Field(None, max_length=128)
    stock: Optional[float] = Field(None, ge=0)
    reserved_qty: Optional[float] = Field(None, ge=0)
    is_active: Optional[bool] = None
    supplier_id: Optional[int] = None
    producer_id: Optional[int] = None
    supplier_name_override: Optional[str] = Field(None, max_length=256)
    lead_time_days: Optional[int] = Field(None, ge=0)
    moq: Optional[float] = Field(None, ge=0)
    purchase_pack_qty: Optional[float] = Field(None, gt=0)
    free_shipping_threshold_net: Optional[float] = Field(None, ge=0)
    last_purchase_price_net: Optional[float] = Field(None, ge=0)
    supplier_sku: Optional[str] = Field(None, max_length=128)
    location_label: Optional[str] = Field(None, max_length=512)
    purchase_price: Optional[float] = Field(None, ge=0)
    unit_cost: Optional[float] = Field(None, ge=0)
    vat_rate_pct: Optional[float] = Field(None, ge=0, le=100)
    package_qty: Optional[float] = Field(None, gt=0)
    package_net_total: Optional[float] = Field(None, ge=0)
    package_gross_total: Optional[float] = Field(None, ge=0)
    low_stock_threshold: Optional[float] = Field(None, ge=0)
    reorder_qty: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None
    width_mm: Optional[float] = None
    length_m: Optional[float] = None
    thickness_micron: Optional[float] = None
    color: Optional[str] = None
    net_weight_foil_kg: Optional[float] = None
    tube_weight_kg: Optional[float] = None
    stretch_percent: Optional[float] = None
    tube_diameter_mm: Optional[float] = None
    adhesive_type: Optional[str] = None
    tape_weight_kg: Optional[float] = None
    core_paper_weight_kg: Optional[float] = None
    roll_diameter_mm: Optional[float] = None
    grammage_gsm: Optional[float] = None
    paper_type: Optional[str] = None
    roll_weight_kg: Optional[float] = None
    bubble_width_cm: Optional[float] = None
    bubble_diameter_mm: Optional[float] = None
    tolerance_percent: Optional[float] = None
    bubble_weight_kg: Optional[float] = None
    plastic_kg_per_unit: Optional[float] = Field(None, ge=0)
    paper_kg_per_unit: Optional[float] = Field(None, ge=0)
    wood_kg_per_unit: Optional[float] = Field(None, ge=0)
    glass_kg_per_unit: Optional[float] = Field(None, ge=0)
    metal_kg_per_unit: Optional[float] = Field(None, ge=0)
    packaging_type: Optional[str] = Field(None, max_length=64)
    include_in_bdo: Optional[bool] = None
    price_tiers: Optional[List[PriceTierIn]] = None

    @field_validator("package_qty", mode="before")
    @classmethod
    def _packaging_update_package_qty_coerce(cls, v: object) -> object:
        return _optional_package_qty_before(v)


class PackagingMaterialStockPatch(BaseModel):
    stock: float = Field(..., ge=0)

    @field_validator("stock")
    @classmethod
    def _finite(cls, v: float) -> float:
        x = float(v)
        if not math.isfinite(x):
            raise ValueError("stock must be a finite number")
        return x


class WmBulkSupplierBody(BaseModel):
    """Bulk-set main supplier on selected carton or packaging material ids (same warehouse)."""

    ids: List[str] = Field(..., min_length=1)
    supplier_id: Optional[int] = Field(None, description="Main supplier; null clears assignment")


def carton_base_unit_prices(
    *,
    vat_rate_pct: float,
    package_qty: Optional[float],
    package_net_total: Optional[float],
    package_gross_total: Optional[float],
) -> tuple[Optional[float], Optional[float], Optional[float], Optional[float]]:
    pn, pg = complete_package_totals(package_net_total, package_gross_total, vat_rate_pct=vat_rate_pct)
    un, ug = unit_prices_from_package(package_qty, pn, pg)
    return pn, pg, un, ug
