"""Request/response models for WMS warehouse carriers API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

from .inventory_damage_trace import InventoryDamageTraceOut


class WarehouseCarrierGroupRead(BaseModel):
    id: int
    tenant_id: int
    name: str = ""
    code: str = ""
    color: Optional[str] = None
    default_weight: Optional[float] = None
    default_width: Optional[float] = None
    default_height: Optional[float] = None
    default_depth: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class WarehouseCarrierGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    code: str = Field(..., min_length=1, max_length=32)
    color: Optional[str] = Field(default=None, max_length=32)
    default_weight: Optional[float] = None
    default_width: Optional[float] = None
    default_height: Optional[float] = None
    default_depth: Optional[float] = None


class WarehouseCarrierRead(BaseModel):
    id: int
    tenant_id: int
    code: str
    barcode: str
    name: Optional[str] = None
    carrier_group_id: Optional[int] = None
    carrier_group_code: Optional[str] = None
    current_location_id: Optional[int] = None
    current_location_code: Optional[str] = None
    current_warehouse_id: Optional[int] = None
    status: str = "ACTIVE"
    is_mixed: bool = False
    weight: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    depth: Optional[float] = None
    notes: Optional[str] = None
    sku_count: int = 0
    total_qty: float = 0.0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None


class WarehouseCarrierCreate(BaseModel):
    carrier_group_id: Optional[int] = Field(default=None, ge=1)
    barcode_prefix: str = Field(default="PAL", max_length=8, description="PAL | BOX | BIN | CRT | MIX")
    code: Optional[str] = Field(default=None, max_length=64, description="Jeśli puste — równe barcode po utworzeniu.")
    name: Optional[str] = Field(default=None, max_length=256)
    status: str = Field(default="ACTIVE", max_length=24)
    weight: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    depth: Optional[float] = None
    notes: Optional[str] = None
    current_location_id: Optional[int] = Field(default=None, ge=1)

    @field_validator("barcode_prefix")
    @classmethod
    def barcode_prefix_norm(cls, v: str) -> str:
        p = (v or "PAL").strip().upper().rstrip("-")
        if p not in ("PAL", "BOX", "BIN", "CRT", "MIX"):
            raise ValueError("barcode_prefix must be PAL, BOX, BIN, CRT or MIX")
        return p


class WarehouseCarrierPatch(BaseModel):
    name: Optional[str] = Field(default=None, max_length=256)
    status: Optional[str] = Field(default=None, max_length=24)
    current_location_id: Optional[int] = Field(default=None, ge=1)
    carrier_group_id: Optional[int] = Field(default=None, ge=1)
    weight: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    depth: Optional[float] = None
    notes: Optional[str] = None
    is_mixed: Optional[bool] = None


class WarehouseCarrierMoveBody(BaseModel):
    to_location_id: int = Field(..., ge=1)


class WarehouseCarrierAddItemLine(BaseModel):
    product_id: int = Field(..., ge=1)
    quantity: float = Field(..., gt=0)
    warehouse_stock_id: Optional[int] = Field(default=None, ge=1)


class WarehouseCarrierAddItemsBody(BaseModel):
    lines: List[WarehouseCarrierAddItemLine] = Field(..., min_length=1)


class WarehouseCarrierRemoveItemsBody(BaseModel):
    item_ids: List[int] = Field(..., min_length=1)


class WarehouseCarrierItemRead(BaseModel):
    id: int
    product_id: int
    product_sku: Optional[str] = None
    product_ean: Optional[str] = None
    product_name: Optional[str] = None
    product_image_url: Optional[str] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[str] = None
    serial_number: Optional[str] = None
    quantity: float = 0.0
    warehouse_stock_id: Optional[int] = None
    stock_disposition: Optional[str] = None
    disposition_badge: Optional[str] = None
    damage_class: Optional[str] = None
    damage_trace: Optional[InventoryDamageTraceOut] = None


class WarehouseCarrierDetailRead(WarehouseCarrierRead):
    items: List[WarehouseCarrierItemRead] = Field(default_factory=list)


class WarehouseCarrierLogRead(BaseModel):
    id: int
    operation_type: str
    operation_type_label: str = ""
    performed_by_user_id: Optional[int] = None
    performed_by_name: str = ""
    metadata_json: Optional[str] = None
    created_at: Optional[datetime] = None


class WarehouseCarrierScanOut(BaseModel):
    found: bool = False
    carrier: Optional[WarehouseCarrierRead] = None


class WarehouseCarrierBulkCreate(BaseModel):
    """Seryjne tworzenie nośników (np. 100× PAL-000001 …) — numeracja globalna per tenant + prefiks."""

    group_id: int = Field(..., ge=1, description="ID grupy nośników (warehouse_carrier_groups)")
    prefix: str = Field(..., min_length=2, max_length=8, description="PAL | BOX | BIN | CRT | MIX (bez lub z myślnikiem)")
    quantity: int = Field(..., ge=1, le=5000)
    status: str = Field(default="ACTIVE", max_length=24, description="Status początkowy nośników")
    location_id: Optional[int] = Field(default=None, ge=1, description="Opcjonalna lokalizacja startowa (locations.id)")
    notes: Optional[str] = Field(default=None, max_length=2000, description="Opcjonalne notatki (wspólne dla partii)")

    @field_validator("prefix")
    @classmethod
    def prefix_ok(cls, v: str) -> str:
        p = (v or "").strip().upper().rstrip("-")
        if p not in ("PAL", "BOX", "BIN", "CRT", "MIX"):
            raise ValueError("prefix must be PAL, BOX, BIN, CRT or MIX")
        return p

    @field_validator("status")
    @classmethod
    def status_norm(cls, v: str) -> str:
        return (v or "ACTIVE").strip().upper()[:24] or "ACTIVE"


class WarehouseCarrierBulkCreateResult(BaseModel):
    created_count: int
    first_barcode: str
    last_barcode: str
    first_id: int
    last_id: int


class StockDocumentItemCarrierSuggestionPatch(BaseModel):
    """Przypisanie sugerowanego nośnika do linii PZ (tylko sugestia dla receiving)."""

    pz_item_id: int = Field(..., ge=1)
    suggested_warehouse_carrier_id: Optional[int] = Field(default=None, ge=1)
