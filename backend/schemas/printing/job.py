"""Print job queue schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class PrintJobPayload(BaseModel):
    pdf_url: str = Field(..., min_length=1)
    copies: int = Field(default=1, ge=1, le=99)


class PrintJobCreateRequest(BaseModel):
    printer_id: int
    document_type: str = Field(..., min_length=1, max_length=64)
    document_id: int | None = None
    warehouse_id: int | None = None
    payload: PrintJobPayload


class PrintJobRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int | None = None
    printer_id: int
    printer_name: str | None = None
    agent_id: int | None = None
    agent_name: str | None = None
    machine_id: str | None = None
    document_type: str
    document_id: int | None = None
    payload_json: dict[str, Any] | str
    status: str
    error_message: str | None = None
    copies: int = 1
    parent_job_id: int | None = None
    retry_number: int = 0
    source_module: str | None = None
    job_type: str | None = None
    created_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_seconds: int | None = None

    model_config = ConfigDict(from_attributes=True)


class PrintJobParentSummary(BaseModel):
    id: int
    status: str
    retry_number: int
    created_at: datetime | None = None


class PrintJobDetailRead(PrintJobRead):
    retry_count: int | None = None
    parent_job: PrintJobParentSummary | None = None


class PrintJobPendingItem(BaseModel):
    id: int
    printer_id: int
    system_name: str
    document_type: str
    document_id: int | None = None
    payload: dict[str, Any]


class PrintJobPendingResponse(BaseModel):
    jobs: list[PrintJobPendingItem] = Field(default_factory=list)


class PrintJobCompleteRequest(BaseModel):
    pass


class PrintJobFailRequest(BaseModel):
    error_message: str = Field(..., min_length=1, max_length=2000)
