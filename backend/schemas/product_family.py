"""Pydantic schemas for Product Family (optional catalog grouping)."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


FamilyDisplayType = Literal["text", "color", "image"]


class FamilyAttributeValueWrite(BaseModel):
    id: Optional[int] = None
    name: str = Field(..., min_length=1, max_length=255)
    sort_order: int = 0
    color_hex: Optional[str] = Field(None, max_length=16)
    image_url: Optional[str] = Field(None, max_length=1024)


class FamilyAttributeWrite(BaseModel):
    id: Optional[int] = None
    name: str = Field(..., min_length=1, max_length=255)
    sort_order: int = 0
    display_type: FamilyDisplayType = "text"
    show_in_filters: bool = False
    sort_alpha: bool = False
    values: list[FamilyAttributeValueWrite] = Field(default_factory=list)


class ProductFamilyCreateBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    is_active: bool = True
    base_product_id: Optional[int] = None
    attributes: list[FamilyAttributeWrite] = Field(default_factory=list)


class ProductFamilyUpdateBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    is_active: bool = True
    base_product_id: Optional[int] = None
    attributes: list[FamilyAttributeWrite] = Field(default_factory=list)


class FamilyAttributeValueRead(BaseModel):
    id: int
    name: str
    sort_order: int
    color_hex: Optional[str] = None
    image_url: Optional[str] = None


class FamilyAttributeRead(BaseModel):
    id: int
    name: str
    sort_order: int
    display_type: str
    show_in_filters: bool
    sort_alpha: bool
    values: list[FamilyAttributeValueRead] = Field(default_factory=list)


class ProductFamilyMemberRead(BaseModel):
    id: int
    name: str
    sku: Optional[str] = None
    catalog_number: Optional[str] = None
    ean: Optional[str] = None
    image_url: Optional[str] = None
    is_base: bool = False
    attribute_summary: str = ""


class ProductFamilyRead(BaseModel):
    id: int
    tenant_id: int
    name: str
    is_active: bool
    base_product_id: Optional[int] = None
    base_product_name: Optional[str] = None
    attributes: list[FamilyAttributeRead] = Field(default_factory=list)
    attribute_count: int = 0
    value_count: int = 0
    product_count: int = 0
    combination_count: int = 0
    members: list[ProductFamilyMemberRead] = Field(default_factory=list)


class ProductFamilyListItem(BaseModel):
    id: int
    tenant_id: int
    name: str
    is_active: bool
    base_product_id: Optional[int] = None
    attribute_count: int = 0
    value_count: int = 0
    product_count: int = 0
    combination_count: int = 0


class ProductFamilyAttachBody(BaseModel):
    product_family_id: Optional[int] = None


class ProductFamilyProductStateRead(BaseModel):
    product_id: int
    product_family_id: Optional[int] = None
    family: Optional[ProductFamilyRead] = None
    family_product_count: int = 0
