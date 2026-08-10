"""Schemas for WMS general (shared) settings."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

_ALLOWED = frozenset({16, 18, 21})


def _validate_font_px(v: int) -> int:
    iv = int(v)
    if iv not in _ALLOWED:
        raise ValueError("Dozwolone wielkości czcionki: 16, 18 lub 21 px.")
    return iv


class WmsGeneralSettingsRead(BaseModel):
    tenant_id: int
    warehouse_id: int
    font_size_base_px: int = 18
    font_size_location_px: int = 18
    font_size_quantity_px: int = 18


class WmsGeneralSettingsSave(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: int | None = Field(default=None, ge=1)
    font_size_base_px: int = 18
    font_size_location_px: int = 18
    font_size_quantity_px: int = 18

    @field_validator("font_size_base_px", "font_size_location_px", "font_size_quantity_px")
    @classmethod
    def _font_px(cls, v: int) -> int:
        return _validate_font_px(v)
