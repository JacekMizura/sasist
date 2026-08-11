"""Schemas for WMS picking terminal scan settings."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class WmsPickingListDisplay(BaseModel):
    """Lista zbierania — widoczność pól na kafelkach produktów (Settings → WMS → Zbieranie → Widok)."""

    show_product_image: bool = True
    show_ean: bool = True
    show_sku: bool = True
    show_catalog_number: bool = False
    show_stock: bool = True
    show_location: bool = True


class WmsPickingTerminalSettingsRead(BaseModel):
    tenant_id: int
    warehouse_id: int
    require_product_scan_at_least_once: bool = True
    require_location_scan: bool = False
    disable_force_location_scan_when_many_locations: bool = False
    allow_reserve_location_picking: bool = False
    allow_products_without_ean: bool = False
    list_display: WmsPickingListDisplay = Field(default_factory=WmsPickingListDisplay)


class WmsPickingTerminalSettingsSave(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: int | None = Field(default=None, ge=1)
    require_product_scan_at_least_once: bool = True
    require_location_scan: bool = False
    disable_force_location_scan_when_many_locations: bool = False
    allow_reserve_location_picking: bool = False
    allow_products_without_ean: bool = False
    #: Opcjonalne w PATCH — brak = zachowaj istniejące w DB.
    list_display: Optional[WmsPickingListDisplay] = None
