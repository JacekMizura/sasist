"""API schemas for custom permission presets."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class PermissionPresetRead(BaseModel):
    id: int
    name: str
    description: str | None
    visibility: str
    permission_keys: list[str]
    created_by_user_id: int | None
    created_at: datetime


class PermissionPresetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    description: str | None = None
    visibility: Literal["personal", "organization"] = "personal"
    permission_keys: list[str]


class PermissionPresetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = None
    visibility: Literal["personal", "organization"] | None = None
    permission_keys: list[str] | None = None


class AvatarUploadResponse(BaseModel):
    avatar_url: str
