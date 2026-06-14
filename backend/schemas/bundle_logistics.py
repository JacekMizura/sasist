"""P4.17 — Bundle logistics & EAN automation API schemas."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class BundleBarcodeResolveOut(BaseModel):
    found: bool
    match_kind: Optional[str] = None
    barcode: str = ""
    bundle_id: Optional[int] = None
    bundle_name: Optional[str] = None
    bundle_fulfillment_mode: Optional[str] = None
    product_id: Optional[int] = None
    linked_product_id: Optional[int] = None
    is_stock_logistic_sku: bool = False


class BundleScanComponentOut(BaseModel):
    order_item_id: int
    product_id: int
    product_name: str
    quantity_required: float
    quantity_picked: float
    quantity_to_pick: float
    bundle_component_index: Optional[int] = None
    pick_done: bool = False


class BundleScanOut(BaseModel):
    found: bool
    domain: str
    barcode: str
    match_kind: Optional[str] = None
    bundle_id: Optional[int] = None
    bundle_name: Optional[str] = None
    bundle_fulfillment_mode: Optional[str] = None
    action: Optional[str] = None
    product_id: Optional[int] = None
    order_id: Optional[int] = None
    order_item_id: Optional[int] = None
    quantity: float = 1.0
    missing_components: list[BundleScanComponentOut] = Field(default_factory=list)
    bundle_verified: bool = False
    message: Optional[str] = None
    traceability_links: dict = Field(default_factory=dict)
    return_tree_order_ids: list[int] = Field(default_factory=list)


class BundlePickingScanBody(BaseModel):
    barcode: str = Field(..., min_length=1)
    cart_id: int = Field(..., ge=1)
    source_status_id: int = Field(..., ge=1)
    order_type: Literal["single", "multi", "all"] = "all"
    location_id: Optional[int] = Field(None, ge=1)


class BundlePackingScanBody(BaseModel):
    barcode: str = Field(..., min_length=1)


class BundleBulkStockScanBody(BaseModel):
    barcode: str = Field(..., min_length=1)
    scan_count: int = Field(..., ge=1, le=500)


class BundleBulkStockScanOut(BaseModel):
    scans: list[BundleScanOut]
    lines_complete: int
    target_scans: int


class BundleLogisticUnitPlaceBody(BaseModel):
    bundle_id: int = Field(..., ge=1)
    linked_product_id: int = Field(..., ge=1)
    quantity: float = Field(1.0, gt=0)
    placement_type: Literal["cart", "carrier", "pallet", "location"]
    cart_id: Optional[int] = None
    carrier_id: Optional[int] = None
    location_id: Optional[int] = None
    order_id: Optional[int] = None


class BundleLogisticUnitRead(BaseModel):
    id: int
    bundle_id: int
    linked_product_id: Optional[int] = None
    quantity: float
    placement_type: str
    status: str
    cart_id: Optional[int] = None
    carrier_id: Optional[int] = None
    location_id: Optional[int] = None
    order_id: Optional[int] = None


class ConsolidationRackBundleRowOut(BaseModel):
    order_id: int
    order_number: str
    bundle_id: int
    bundle_name: str
    fulfillment_mode: str
    display_mode: str
    ean: Optional[str] = None
    sku: Optional[str] = None
    quantity: float
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    shelf_label: Optional[str] = None
