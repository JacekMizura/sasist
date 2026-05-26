"""API payloads for configurable workforce user groups (teams)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class WorkforceUserGroupRead(BaseModel):
    id: int
    name: str
    color: str
    icon_key: str
    archived_at: datetime | None = None
    default_permission_keys: list[str] = Field(default_factory=list)
    default_wms_modes: list[str] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class WorkforceUserGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    color: str = Field(default="#64748b", max_length=32)
    icon_key: str = Field(default="Users", max_length=64)
    default_permission_keys: list[str] = Field(default_factory=list)
    default_wms_modes: list[str] = Field(default_factory=list)


class WorkforceUserGroupUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=128)
    color: str | None = Field(None, max_length=32)
    icon_key: str | None = Field(None, max_length=64)
    archived_at: datetime | None = None
    default_permission_keys: list[str] | None = None
    default_wms_modes: list[str] | None = None
