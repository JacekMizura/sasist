"""Pydantic schemas for product category tree and product assignment."""

from __future__ import annotations

from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ProductCategoryCreateBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    parent_id: Optional[int] = None
    description: Optional[str] = None
    is_active: bool = True
    sort_order: Optional[int] = None
    sku_code: Optional[str] = Field(None, max_length=64)
    catalog_code: Optional[str] = Field(None, max_length=64)
    sku_template: Optional[str] = Field(None, max_length=255)
    catalog_template: Optional[str] = Field(None, max_length=255)


class ProductCategoryUpdateBody(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    parent_id: Optional[int] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    #: Explicit clear of parent (move to root). Distinct from omitting parent_id.
    clear_parent: bool = False
    sku_code: Optional[str] = Field(None, max_length=64)
    catalog_code: Optional[str] = Field(None, max_length=64)
    sku_template: Optional[str] = Field(None, max_length=255)
    catalog_template: Optional[str] = Field(None, max_length=255)
    default_vat_rate: Optional[float] = None
    default_manufacturer_id: Optional[int] = None
    default_label_template_id: Optional[int] = None
    default_unit: Optional[str] = Field(None, max_length=32)
    default_warehouse_id: Optional[int] = None
    default_supplier_id: Optional[int] = None
    clear_default_vat_rate: bool = False
    clear_default_manufacturer_id: bool = False
    clear_default_label_template_id: bool = False
    attributes_schema_json: Optional[Any] = None
    marketplace_mapping_json: Optional[Any] = None


class ProductCategoryMoveBody(BaseModel):
    """Prepared for future drag-and-drop reparent / reorder."""

    parent_id: Optional[int] = None
    sort_order: int = 0
    clear_parent: bool = False


class ProductCategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    parent_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    is_active: bool
    sort_order: int
    sku_code: Optional[str] = None
    catalog_code: Optional[str] = None
    sku_template: Optional[str] = None
    catalog_template: Optional[str] = None
    product_count: int = 0
    child_count: int = 0
    #: Breadcrumb names from root to this node (inclusive).
    path_names: List[str] = Field(default_factory=list)
    path_ids: List[int] = Field(default_factory=list)
    default_vat_rate: Optional[float] = None
    default_manufacturer_id: Optional[int] = None
    default_label_template_id: Optional[int] = None
    default_unit: Optional[str] = None
    default_warehouse_id: Optional[int] = None
    default_supplier_id: Optional[int] = None
    attributes_schema_json: Optional[Any] = None
    marketplace_mapping_json: Optional[Any] = None


class ProductCategoryTreeNode(BaseModel):
    id: int
    parent_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    is_active: bool
    sort_order: int
    sku_code: Optional[str] = None
    catalog_code: Optional[str] = None
    sku_template: Optional[str] = None
    catalog_template: Optional[str] = None
    product_count: int = 0
    path_names: List[str] = Field(default_factory=list)
    path_ids: List[int] = Field(default_factory=list)
    children: List["ProductCategoryTreeNode"] = Field(default_factory=list)


ProductCategoryTreeNode.model_rebuild()


class ProductCategoryTreeOut(BaseModel):
    nodes: List[ProductCategoryTreeNode]


class ProductCategoryAssignmentRead(BaseModel):
    product_id: int
    primary_category_id: Optional[int] = None
    primary_path_names: List[str] = Field(default_factory=list)
    primary_path_ids: List[int] = Field(default_factory=list)
    additional_category_ids: List[int] = Field(default_factory=list)
    additional: List[ProductCategoryRead] = Field(default_factory=list)


class ProductCategoryAssignmentBody(BaseModel):
    primary_category_id: Optional[int] = None
    additional_category_ids: List[int] = Field(default_factory=list)


class ProductCategoryExtensionHooksRead(BaseModel):
    """
    Read-only mirror of reserved extension columns — documents the future API surface.
    Not exposed in v1 UI; available for admin/debug later.
    """

    sku_generator_json: Optional[Any] = None
    catalog_number_generator_json: Optional[Any] = None
    default_label_template_id: Optional[int] = None
    default_vat_rate: Optional[float] = None
    default_manufacturer_id: Optional[int] = None
    attributes_schema_json: Optional[Any] = None
    marketplace_mapping_json: Optional[Any] = None
    extensions_json: Optional[Any] = None
