"""Response models for WMS location visual preview."""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from .inventory_damage_trace import InventoryDamageTraceOut


class LocationVisualWarehouseOut(BaseModel):
    id: int
    name: str


class LocationVisualZoneOut(BaseModel):
    code: str = ""
    aisle: str = ""
    level: str = ""
    position: str = ""


class LocationVisualRackOut(BaseModel):
    id: int
    name: str = ""
    aisle_letter: str = ""
    rack_index: int = 0
    levels: int = 0
    bins_per_level: int = 0
    color: Optional[str] = None


class LocationVisualRackGridCellOut(BaseModel):
    id: int
    name: str = ""
    x: float = 0
    y: float = 0
    width: float = 1
    height: float = 1
    color: Optional[str] = None
    zone_code: str = ""
    is_active: bool = False
    aisle_letter: str = ""
    is_same_aisle: bool = False


class LocationVisualBinOut(BaseModel):
    code: str = ""
    location_id: Optional[int] = None
    level_index: int = 0
    level_number: int = 1
    segment_index: int = 0
    segment_label: str = ""
    is_active: bool = False
    storage_type: Optional[str] = None
    location_kind: Optional[str] = None
    is_empty: bool = True
    is_blocked: bool = False
    sku: Optional[str] = None
    quantity: float = 0
    carrier_code: Optional[str] = None


class LocationVisualCarrierOut(BaseModel):
    id: int
    code: str
    barcode: str = ""
    name: Optional[str] = None
    status: str = "ACTIVE"
    sku_count: int = 0
    total_qty: float = 0


class LocationVisualProductOut(BaseModel):
    product_id: int
    sku: Optional[str] = None
    ean: Optional[str] = None
    name: Optional[str] = None
    image_url: Optional[str] = None
    quantity: float = 0
    stock_disposition: Optional[str] = None
    disposition_badge: Optional[str] = None
    damage_class: Optional[str] = None
    damage_trace: Optional[InventoryDamageTraceOut] = None
    row_key: Optional[str] = Field(default=None, description="Unique key when same SKU split by disposition")


CapacityBasis = Literal["volume", "weight", "slots", "none"]


class LocationVisualOccupancyOut(BaseModel):
    sku_count: int = 0
    total_qty: float = 0
    occupied_volume_dm3: float = 0
    used_volume_dm3: float = 0
    max_volume_dm3: Optional[float] = None
    used_weight_kg: float = 0
    max_weight_kg: Optional[float] = None
    used_slots: Optional[int] = None
    total_slots: Optional[int] = None
    capacity_basis: CapacityBasis = "none"
    capacity_utilization_percent: Optional[float] = None
    capacity_label: Optional[str] = None
    storage_type: Optional[str] = None
    location_type: str = "PICK"


class LocationVisualLastMovementOut(BaseModel):
    """Ostatni ruch magazynowy powiązany z lokalizacją / nośnikiem."""

    type_label: str = Field(default="", description="Np. Przyjęcie PZ, Rozlokowanie")
    document_label: Optional[str] = Field(default=None, description="Numer dokumentu, np. PZ-2026-00452")
    occurred_at: Optional[datetime] = None


class LocationVisualContextOut(BaseModel):
    warehouse: LocationVisualWarehouseOut
    location: dict = Field(default_factory=dict)
    zone: LocationVisualZoneOut
    rack: Optional[LocationVisualRackOut] = None
    rack_grid: List[LocationVisualRackGridCellOut] = Field(default_factory=list)
    rack_bins: List[LocationVisualBinOut] = Field(default_factory=list)
    carrier: Optional[LocationVisualCarrierOut] = None
    products: List[LocationVisualProductOut] = Field(default_factory=list)
    occupancy: LocationVisualOccupancyOut = Field(default_factory=LocationVisualOccupancyOut)
    last_movement: Optional[LocationVisualLastMovementOut] = None
    last_movement_at: Optional[datetime] = None
