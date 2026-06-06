"""Operational feature capability probe — frontend-safe, no side effects."""

from __future__ import annotations

from pydantic import BaseModel, Field


class OperationalFeaturesRead(BaseModel):
    direct_sales: bool = Field(..., description="Direct sale sessions API available")
    runtime: bool = Field(..., description="Operational runtime + live events")
    replenishment: bool = Field(..., description="Replenishment engine API")
