from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ReplenishmentRuleUpsertBody(BaseModel):
    zone_type: str
    min_qty: float = Field(..., ge=0)
    rule_id: int | None = None
    product_id: int | None = None
    task_type: str = "REPLENISHMENT"
    max_qty: float | None = Field(None, ge=0)
    target_qty: float | None = Field(None, ge=0)
    preferred_source_zone_type: str | None = None
    season_key: str | None = None
    time_window: dict[str, Any] | None = None
    priority: int = 50
    is_active: bool = True


class ReplenishmentRuleRead(BaseModel):
    id: int
    warehouse_id: int
    product_id: int | None = None
    zone_type: str
    task_type: str
    min_qty: float
    max_qty: float | None = None
    target_qty: float | None = None
    preferred_source_zone_type: str | None = None
    priority: int
    is_active: bool
    updated_at: datetime | None = None


class ReplenishmentScanResult(BaseModel):
    created: int
    tasks: list[dict[str, Any]]
    skipped: str | None = None


class ReplenishmentExecuteStepBody(BaseModel):
    step: str = Field(..., min_length=1, max_length=24)
    scan_code: str | None = Field(None, max_length=128)
    note: str | None = Field(None, max_length=256)


class ReplenishmentExecuteStepResult(BaseModel):
    task_id: int
    orchestration_state: str | None = None
    status: str
    quantity_done: float
    task_payload: dict[str, Any] = Field(default_factory=dict)
