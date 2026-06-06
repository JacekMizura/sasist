"""Operational feature capability probe — frontend-safe, no side effects."""

from __future__ import annotations

from pydantic import BaseModel, Field


class OperationalFeaturesRead(BaseModel):
    direct_sales: bool = Field(..., description="Direct sale sessions API available")
    runtime: bool = Field(..., description="Operational runtime + live events")
    replenishment: bool = Field(..., description="Replenishment engine API")


class OperationalFeaturesResolvedDebug(BaseModel):
    direct_sales: bool
    runtime: bool
    replenishment: bool
    operational_sales: bool = False
    operational_sales_sessions: bool = False
    resolution_scope: str = "global"


class OperationalFeaturesDebugRead(BaseModel):
    env: dict[str, bool] = Field(default_factory=dict)
    tenant: dict[str, bool] = Field(default_factory=dict)
    warehouse: dict[str, bool] = Field(default_factory=dict)
    resolved: OperationalFeaturesResolvedDebug
