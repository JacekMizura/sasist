"""Agent release metadata and auto-print settings schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class AgentVersionResponse(BaseModel):
    version: str
    download_url: str
    mandatory: bool = False


class PrintingAutoPrintRead(BaseModel):
    tenant_id: int
    labels: bool = False
    stock_documents: bool = False
    sale_documents: bool = False
    shipping_labels: bool = False

    model_config = ConfigDict(from_attributes=True)


class PrintingAutoPrintUpdate(BaseModel):
    labels: bool | None = None
    stock_documents: bool | None = None
    sale_documents: bool | None = None
    shipping_labels: bool | None = None
