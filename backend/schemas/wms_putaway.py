"""WMS putaway (rozlokowanie) — assign received PZ qty to storage locations."""

from __future__ import annotations

from datetime import date
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from .stock_document import StockDocumentRead


class WmsPutawayPatchBody(BaseModel):
    location_id: int = Field(..., ge=1)
    quantity: float = Field(..., gt=0)
    warehouse_carrier_id: Optional[int] = Field(
        default=None,
        description="Jeśli ustawione — pobór z nośnika na lokacji przyjęcia PZ i zapis na docelową z tym samym nośnikiem.",
    )

    @field_validator("warehouse_carrier_id")
    @classmethod
    def carrier_id_ok(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return None
        if int(v) < 1:
            raise ValueError("warehouse_carrier_id must be >= 1")
        return int(v)

    @field_validator("quantity")
    @classmethod
    def quantity_finite(cls, v: float) -> float:
        import math

        if not math.isfinite(v):
            raise ValueError("quantity must be finite")
        if v > 1e9:
            raise ValueError("quantity too large")
        return v


class WmsPutawaySuggestLocationOut(BaseModel):
    location_id: Optional[int] = None
    location_name: Optional[str] = None
    source: Literal["none", "existing_stock_lot", "existing_stock", "first_location"] = "none"


class WmsPutawayLocationSuggestionRow(BaseModel):
    location_id: int
    code: str = ""
    current_quantity: float = 0.0
    free_capacity: Optional[float] = None
    warehouse_zone: Optional[str] = None
    priority_score: float = 0.0
    location_type: str = Field(default="PICK", description="WMS badge kind (PICK | BUFFER | …).")
    storage_type: str = Field(default="unknown", description="Layout bin chrome for LocationBadge.")
    max_fit_quantity: Optional[float] = None
    remaining_capacity_percent: Optional[float] = None
    same_sku_present: bool = False
    reason_tags: List[str] = Field(default_factory=list)
    capacity_fits: bool = True
    capacity_warnings: List[str] = Field(default_factory=list)
    #: SSOT product×location capacity card (fit_engine)
    total_capacity: Optional[float] = None
    additional_capacity: Optional[float] = None
    utilization_percent: Optional[float] = None
    confidence: Optional[str] = None
    method: Optional[str] = None
    limiting_factor: Optional[str] = None
    limiting_factor_label: Optional[str] = None
    additional_capacity_label: Optional[str] = None
    capacity_ratio_label: Optional[str] = None
    used_defaults: Optional[bool] = None
    defaulted_fields: List[str] = Field(default_factory=list)
    geometry_source: Optional[str] = None
    capacity_numeric_trusted: Optional[bool] = None
    capacity_confidence: Optional[str] = None
    planning_additional_capacity: Optional[float] = None


class WmsPutawayLocationSuggestionsOut(BaseModel):
    suggested_primary_locations: List[WmsPutawayLocationSuggestionRow] = Field(default_factory=list)
    suggested_overflow_locations: List[WmsPutawayLocationSuggestionRow] = Field(default_factory=list)
    existing_stock_locations: List[WmsPutawayLocationSuggestionRow] = Field(default_factory=list)
    #: PLAN only — never mutates stock
    distribution_plan: Optional[dict] = None


class WmsTenantContextOut(BaseModel):
    warehouse_id: int
    warehouse_name: str = ""


class WmsPutawayPatchLocationRow(BaseModel):
    """One bin allocation after putaway save."""

    location_id: int
    code: str = ""
    quantity: float = 0.0
    location_type: str = Field(default="PICK", description="WMS badge kind (PICK | BUFFER | …).")
    storage_type: str = Field(default="unknown", description="Canonical type for layout / LocationTypeBadge.")
    zone: Optional[str] = None
    capacity_type: Optional[str] = None


class WmsPutawayInventorySnapshotRow(BaseModel):
    """Stock row after putaway (matches Inventory lot key for this allocation)."""

    product_id: int
    location_id: int
    location_uuid: Optional[str] = None
    quantity: float
    batch: Optional[str] = None
    expiration_date: Optional[date] = None
    stock_disposition: str = Field(default="SALEABLE", description="Warehouse quality bucket (parallel to inventory row).")


class WmsPutawayCarrierBulkBody(BaseModel):
    """Rozlokowanie wszystkich pozostałych linii przypisanych do nośnika na jednej PZ."""

    document_id: int = Field(..., ge=1)
    warehouse_carrier_id: int = Field(..., ge=1)
    location_id: int = Field(..., ge=1)


class WmsPutawayCarrierBulkOut(BaseModel):
    lines_putaway: int = 0
    total_quantity: float = 0.0
    document: StockDocumentRead


class WmsPutawayPatchOut(BaseModel):
    """PATCH /wms/putaway/{item_id} — line totals + refreshed PZ document."""

    item_id: int
    total_putaway_quantity: float
    locations: List[WmsPutawayPatchLocationRow]
    document: StockDocumentRead
    inventory_snapshot: Optional[WmsPutawayInventorySnapshotRow] = None
