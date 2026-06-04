"""API: batch rozlokowania (dokument ZWK) vs sesja operatora."""

from __future__ import annotations

from pydantic import BaseModel, Field


class WmsRelocationBatchContextOut(BaseModel):
    order_id: int
    warehouse_id: int
    document_id: int | None = None
    document_label: str | None = None
    relocation_task_id: int | None = None
    pending_lines: int = 0
    has_active_document: bool = False


class WmsRelocationAddItemsBody(BaseModel):
    order_id: int = Field(..., ge=1)
    order_item_ids: list[int] | None = None


class WmsRelocationAddItemsOut(BaseModel):
    ok: bool = True
    order_id: int
    document_id: int
    document_label: str
    lines_added: int = 0
    lines_skipped: int = 0
    relocation_task_id: int | None = None
    redirect_to_relocation: bool = False


class WmsRelocationStartSessionBody(BaseModel):
    order_id: int | None = None
    task_id: int | None = None
    takeover: bool = False


class WmsRelocationStartSessionOut(BaseModel):
    ok: bool = True
    task_id: int
    document_id: int | None = None
    document_label: str | None = None
    session_started: bool = False
