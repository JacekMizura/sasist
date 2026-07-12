"""Printer agent registration and listing schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ...models.printing.constants import PRINTER_TYPES


class RegisterAgentPrinterPayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    system_name: str = Field(..., min_length=1, max_length=255)
    printer_type: str = Field(default="other")
    is_default: bool = False
    capabilities_json: dict[str, Any] | None = None

    @field_validator("printer_type")
    @classmethod
    def _validate_printer_type(cls, v: str) -> str:
        normalized = (v or "other").strip().lower()
        if normalized not in PRINTER_TYPES:
            raise ValueError(f"printer_type must be one of: {', '.join(PRINTER_TYPES)}")
        return normalized


class AgentRegisterRequest(BaseModel):
    machine_id: str = Field(..., min_length=1, max_length=128)
    name: str = Field(..., min_length=1, max_length=120)
    version: str | None = Field(default=None, max_length=32)
    warehouse_id: int | None = None
    printers: list[RegisterAgentPrinterPayload] = Field(default_factory=list)


class AgentRegisterResponse(BaseModel):
    agent_id: int
    token: str
    machine_id: str


class AgentHeartbeatRequest(BaseModel):
    last_poll_at: datetime | None = None
    last_error: str | None = Field(default=None, max_length=2000)


class AgentHeartbeatResponse(BaseModel):
    agent_id: int
    is_online: bool
    last_seen_at: datetime | None = None


class PrinterAgentRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int | None = None
    machine_id: str
    name: str
    version: str | None = None
    last_seen_at: datetime | None = None
    last_poll_at: datetime | None = None
    last_error: str | None = None
    is_online: bool
    health_status: str = "offline"
    printer_count: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("is_online", mode="before")
    @classmethod
    def _coerce_is_online(cls, v: object) -> bool:
        if isinstance(v, bool):
            return v
        try:
            return int(v or 0) != 0
        except (TypeError, ValueError):
            return bool(v)
