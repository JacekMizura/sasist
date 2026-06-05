from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class DeviceSessionUpsertBody(BaseModel):
    device_key: str = Field(..., min_length=1, max_length=64)
    workflow_type: str = "PICKING"
    device_kind: str = "SCANNER"
    battery_pct: int | None = Field(None, ge=0, le=100)
    network_state: str | None = None
    payload: dict[str, Any] | None = None


class DeviceSessionRead(BaseModel):
    id: int
    device_key: str
    workflow_type: str
    device_kind: str
    status: str
    operator_user_id: int | None = None
    battery_pct: int | None = None
    network_state: str | None = None
    last_seen_at: datetime | None = None


class OperatorContextUpsertBody(BaseModel):
    context_type: str
    cart_id: int | None = None
    zone_id: int | None = None
    active_task_id: int | None = None
    payload: dict[str, Any] | None = None


class OperatorContextRead(BaseModel):
    operator_user_id: int
    context_type: str
    cart_id: int | None = None
    zone_id: int | None = None
    active_task_id: int | None = None
    payload: dict[str, Any] | None = None
    updated_at: datetime | None = None


class LiveEventRead(BaseModel):
    id: int
    event_type: str
    channel: str
    revision: str | None = None
    payload: dict[str, Any]
    created_at: datetime | None = None
