"""Schemas for server-side print queue orchestration."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class LabelQueuePayload(BaseModel):
    template_id: int
    records: list[dict[str, Any]] = Field(default_factory=list)
    exclude_floors: list[str] | None = None
    printer_profile_id: int | None = None
    template_json: str | None = None
    print_mode: bool = False
    group_mode: bool = False
    group_by_rack: bool = False
    floor_sets: list[list[str]] | None = None


class QueuePrintRequest(BaseModel):
    document_type: str = Field(..., min_length=1, max_length=64)
    document_id: int | None = None
    document_id_str: str | None = None
    warehouse_id: int | None = None
    template_version_id: int | None = None
    copies: int = Field(default=1, ge=1, le=99)
    label: LabelQueuePayload | None = None
