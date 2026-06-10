"""Schemas — notatki i aktywność klienta."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class CustomerNoteOut(BaseModel):
    id: int
    customer_id: int
    body: str
    is_pinned: bool = False
    author_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CustomerNoteCreateBody(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)
    is_pinned: bool = False


class CustomerNoteUpdateBody(BaseModel):
    body: Optional[str] = Field(None, min_length=1, max_length=4000)
    is_pinned: Optional[bool] = None


class CustomerActivityItemOut(BaseModel):
    id: str
    event_type: str
    event_label: str
    occurred_at: str
    operator_name: Optional[str] = None
    summary: str
    detail_path: Optional[str] = None


class CustomerActivityOut(BaseModel):
    items: List[CustomerActivityItemOut] = Field(default_factory=list)
