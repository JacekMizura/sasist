"""Agent printer schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ...models.printing.constants import PRINTER_TYPES


class AgentPrinterRead(BaseModel):
    id: int
    agent_id: int
    name: str
    system_name: str
    printer_type: str
    is_default: bool
    capabilities_json: dict[str, Any] | str | None = None
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None
    agent_name: str | None = None
    machine_id: str | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("is_default", "is_active", mode="before")
    @classmethod
    def _coerce_bool(cls, v: object) -> bool:
        if isinstance(v, bool):
            return v
        try:
            return int(v or 0) != 0
        except (TypeError, ValueError):
            return bool(v)


class AgentPrinterPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    printer_type: str | None = None
    is_default: bool | None = None
    is_active: bool | None = None

    @field_validator("printer_type")
    @classmethod
    def _validate_printer_type(cls, v: str | None) -> str | None:
        if v is None:
            return None
        normalized = v.strip().lower()
        if normalized not in PRINTER_TYPES:
            raise ValueError(f"printer_type must be one of: {', '.join(PRINTER_TYPES)}")
        return normalized
