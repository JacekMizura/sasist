"""Schemas for WMS picking terminal scan settings."""

from __future__ import annotations

from pydantic import BaseModel, Field


class WmsPickingTerminalSettingsRead(BaseModel):
    tenant_id: int
    warehouse_id: int
    require_product_scan_at_least_once: bool = True
    require_location_scan: bool = False
    disable_force_location_scan_when_many_locations: bool = False
    allow_reserve_location_picking: bool = False


class WmsPickingTerminalSettingsSave(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: int | None = Field(default=None, ge=1)
    require_product_scan_at_least_once: bool = True
    require_location_scan: bool = False
    disable_force_location_scan_when_many_locations: bool = False
    allow_reserve_location_picking: bool = False
