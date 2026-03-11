"""Schemas for label_sizes and label_templates (v2)."""

from datetime import datetime
from pydantic import BaseModel


class LabelSizeResponse(BaseModel):
    id: int
    name: str
    width_mm: int
    height_mm: int

    class Config:
        from_attributes = True


class LabelTemplatePayload(BaseModel):
    name: str
    dataset: str  # location | cart | basket | product | order
    label_size_id: int
    layout_json: str
    is_default: bool = False


class LabelTemplateResponse(BaseModel):
    id: int
    tenant_id: int
    name: str
    dataset: str
    label_size_id: int
    layout_json: str
    is_default: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class LabelTemplateWithSizeResponse(LabelTemplateResponse):
    label_size: LabelSizeResponse | None = None
