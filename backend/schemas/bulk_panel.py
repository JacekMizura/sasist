"""Bulk panel UI status updates (orders / returns lists)."""

from typing import List

from pydantic import BaseModel, Field


class BulkPanelStatusPayload(BaseModel):
    """``status`` = panel sub-status id as string, or empty string to clear the label."""

    ids: List[str] = Field(..., min_length=1, description="Entity ids as strings")
    status: str = Field("", description="Sub-status id, or empty to clear")
