"""Pydantic schemas for mail conversation API (Phase 2)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class MailConversationPatch(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_user_id: Optional[int] = Field(None, ge=1)
    clear_assignment: bool = False


class MailConversationReplyBody(BaseModel):
    body: str = Field(..., min_length=1)
    idempotency_key: str = Field(..., min_length=8, max_length=191)
    account_id: Optional[int] = Field(None, ge=1)
    subject: Optional[str] = Field(None, max_length=998)
    template_id: Optional[int] = Field(None, ge=1)
