"""Products missing required master data for WMS receiving — one row per product."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class WmsProductIncompleteRow(BaseModel):
    """Aggregated incomplete product (warehouse operational workflow)."""

    product_id: int
    sku: Optional[str] = None
    ean: Optional[str] = None
    name: str = ""
    image_url: Optional[str] = None
    location_label: Optional[str] = None
    location_zone: Optional[str] = Field(
        default=None,
        description="Strefa / regał do grupowania listy (rack_name lub etykieta lokalizacji).",
    )
    stock: float = 0.0
    missing_fields: List[str] = Field(default_factory=list)
    missing_field_labels: List[str] = Field(
        default_factory=list,
        description="Etykiety pól do uzupełnienia, np. „Brak długości”.",
    )
    required_rules: Dict[str, bool] = Field(default_factory=dict)
    editable_values: Dict[str, Any] = Field(default_factory=dict)
    force_wms_completion: bool = False

    # Backward-compatible aliases for older clients
    product_name: str = ""
    product_ean: Optional[str] = None
    product_sku: Optional[str] = None
    warehouse_qty: float = 0.0
    missing_labels: List[str] = Field(default_factory=list)


class WmsProductIncompleteListOut(BaseModel):
    items: List[WmsProductIncompleteRow] = Field(default_factory=list)
    total: int = 0
    without_location_count: int = 0


class WmsProductIncompleteScanResolve(BaseModel):
    product_id: int
    location_label: Optional[str] = None
