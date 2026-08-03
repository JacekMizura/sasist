"""Pydantic schemas for Supply Flow Living Plan API."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SupplyFlowCtaOut(BaseModel):
    module: str | None = None
    path: str | None = None
    label: str | None = None
    delivery_id: int | None = None
    extras: dict[str, Any] = Field(default_factory=dict)


class SupplyFlowNextActionOut(BaseModel):
    kind: str | None = None
    delivery_id: int | None = None
    line_id: int | None = None
    path: str | None = None
    label: str | None = None
    plan_version: int | None = None
    extras: dict[str, Any] = Field(default_factory=dict)


class SupplyFlowLivingPlanOut(BaseModel):
    tenant_id: int
    warehouse_id: int
    plan_version: int
    computed_at: datetime | None = None
    optimization_goal: str
    planning_horizon_hours: int
    projection: dict[str, Any] = Field(default_factory=dict)
    cta: SupplyFlowCtaOut | None = None
    next_action: SupplyFlowNextActionOut | None = None
    last_recompute_trigger: str | None = None
    has_plan: bool = True


class SupplyFlowConfigOut(BaseModel):
    tenant_id: int
    warehouse_id: int
    optimization_goal: str
    planning_horizon_hours: int


class SupplyFlowConfigUpdateBody(BaseModel):
    optimization_goal: str | None = None
    planning_horizon_hours: int | None = Field(default=None, ge=1, le=24 * 30)


class SupplyFlowRecomputeBody(BaseModel):
    delivery_id: int | None = None
