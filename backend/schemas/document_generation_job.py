"""Document generation job schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class DocumentGenerationJobRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    order_id: int | None = None
    session_id: int | None = None
    document_type: str
    document_subtype: str
    status: str
    sale_document_id: str | None = None
    fiscal_status: str | None = None
    fiscal_ref: str | None = None
    error_message: str | None = None
    created_at: datetime | None = None
    completed_at: datetime | None = None
