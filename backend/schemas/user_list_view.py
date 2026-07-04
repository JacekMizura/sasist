from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ListViewPayloadIn(BaseModel):
    payload: dict[str, Any] = Field(default_factory=dict)
    schema_version: int = Field(default=1, ge=1)


class ListViewPresetCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    payload: dict[str, Any] = Field(default_factory=dict)
    schema_version: int = Field(default=1, ge=1)
    is_public: bool = False
    is_default: bool = False


class ListViewPresetUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    payload: dict[str, Any] | None = None
    schema_version: int | None = Field(default=None, ge=1)
    is_default: bool | None = None


class ListViewAutosaveOut(BaseModel):
    id: int
    payload: dict[str, Any]
    schema_version: int
    updated_at: datetime | None


class ListViewPresetOut(BaseModel):
    id: int
    name: str
    is_default: bool
    is_public: bool
    user_id: int | None
    payload: dict[str, Any]
    schema_version: int
    updated_at: datetime | None
    created_at: datetime | None


class ListViewScreenBundleOut(BaseModel):
    screen_key: str
    autosave: ListViewAutosaveOut | None
    presets: list[ListViewPresetOut]
