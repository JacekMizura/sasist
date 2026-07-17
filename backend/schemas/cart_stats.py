"""Schemas: WMS cart occupancy stats (SSOT)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class WmsCartStatsOut(BaseModel):
    orders_count: int = Field(0, ge=0)
    products_count: int = Field(0, ge=0)
    sections_count: int = Field(0, ge=0)
    occupied_sections: int = Field(0, ge=0)
    volume_used: float = Field(0.0, ge=0)
    percent_used: float = Field(0.0, ge=0)
