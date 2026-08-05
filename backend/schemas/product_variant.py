"""Pydantic schemas for catalog variant groups and product variant SKUs."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


VariantDisplayType = Literal["text", "color", "image"]


class VariantValueWrite(BaseModel):
    id: Optional[int] = None
    name: str = Field(..., min_length=1, max_length=255)
    sort_order: int = 0
    color_hex: Optional[str] = Field(None, max_length=16)
    image_url: Optional[str] = Field(None, max_length=1024)


class VariantAxisWrite(BaseModel):
    id: Optional[int] = None
    name: str = Field(..., min_length=1, max_length=255)
    sort_order: int = 0
    display_type: VariantDisplayType = "text"
    show_in_filters: bool = False
    sort_alpha: bool = False
    values: list[VariantValueWrite] = Field(default_factory=list)


class VariantGroupCreateBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    is_active: bool = True
    axes: list[VariantAxisWrite] = Field(default_factory=list)


class VariantGroupUpdateBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    is_active: bool = True
    axes: list[VariantAxisWrite] = Field(default_factory=list)


class VariantValueRead(BaseModel):
    id: int
    name: str
    sort_order: int
    color_hex: Optional[str] = None
    image_url: Optional[str] = None


class VariantAxisRead(BaseModel):
    id: int
    name: str
    sort_order: int
    display_type: str
    show_in_filters: bool
    sort_alpha: bool
    values: list[VariantValueRead] = Field(default_factory=list)


class VariantGroupRead(BaseModel):
    id: int
    tenant_id: int
    name: str
    is_active: bool
    axes: list[VariantAxisRead] = Field(default_factory=list)
    axis_count: int = 0
    value_count: int = 0
    product_count: int = 0


class VariantGroupListItem(BaseModel):
    id: int
    tenant_id: int
    name: str
    is_active: bool
    axis_count: int = 0
    value_count: int = 0
    product_count: int = 0
    combination_count: int = 0


class ProductVariantAttachBody(BaseModel):
    variant_group_id: Optional[int] = None


class ProductVariantGenerateBody(BaseModel):
    only_missing: bool = True


class ProductVariantSkuPatchBody(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    ean: Optional[str] = None
    sale_price: Optional[float] = None


class ProductVariantValueRead(BaseModel):
    axis_id: int
    axis_name: str
    value_id: int
    value_name: str


class ProductVariantSkuRead(BaseModel):
    id: int
    name: str
    sku: Optional[str] = None
    ean: Optional[str] = None
    sale_price: Optional[float] = None
    image_url: Optional[str] = None
    stock_quantity: float = 0
    values: list[ProductVariantValueRead] = Field(default_factory=list)
    value_key: str = ""


class ProductVariantsStateRead(BaseModel):
    product_id: int
    is_variant_child: bool = False
    parent_product_id: Optional[int] = None
    parent_product_name: Optional[str] = None
    variant_group_id: Optional[int] = None
    group: Optional[VariantGroupRead] = None
    skus: list[ProductVariantSkuRead] = Field(default_factory=list)
    possible_combinations: int = 0
    missing_combinations: int = 0


class ProductVariantGenerateResult(BaseModel):
    created_count: int
    skus: list[ProductVariantSkuRead] = Field(default_factory=list)
