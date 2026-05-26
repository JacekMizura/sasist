from __future__ import annotations

import re
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from pydantic import BaseModel, Field, field_validator

if TYPE_CHECKING:
    from ..models.shipping_method import ShippingMethod


def _norm_code_in(v: str) -> str:
    s = (v or "").strip().upper()
    s = re.sub(r"[^A-Z0-9_]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    if not s:
        raise ValueError("code is required")
    if len(s) > 64:
        raise ValueError("code too long")
    return s


class ShippingMethodRead(BaseModel):
    id: str
    tenant_id: int
    warehouse_id: int
    code: str
    name: str
    aliases: List[str] = Field(default_factory=list)
    logo_url: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ShippingMethodCreate(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: int = Field(..., ge=1)
    code: str = Field(..., min_length=2, max_length=64)
    name: str = Field(..., min_length=1, max_length=256)
    aliases: List[str] = Field(default_factory=list)
    logo_url: Optional[str] = Field(None, max_length=512)
    is_active: bool = True

    @field_validator("code")
    @classmethod
    def _code(cls, v: str) -> str:
        return _norm_code_in(v)


class ShippingMethodUpdate(BaseModel):
    code: Optional[str] = Field(None, min_length=2, max_length=64)
    name: Optional[str] = Field(None, min_length=1, max_length=256)
    aliases: Optional[List[str]] = None
    logo_url: Optional[str] = Field(None, max_length=512)
    is_active: Optional[bool] = None

    @field_validator("code")
    @classmethod
    def _code_opt(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return _norm_code_in(v)


def shipping_method_row_to_read(row: "ShippingMethod") -> ShippingMethodRead:
    from ..services.shipping_method_service import parse_aliases_json

    raw_logo = getattr(row, "logo_url", None)
    logo_url = (str(raw_logo).strip() if raw_logo is not None else "") or None

    return ShippingMethodRead(
        id=str(row.id),
        tenant_id=int(row.tenant_id),
        warehouse_id=int(row.warehouse_id),
        code=str(getattr(row, "code", None) or "").strip().upper() or "MIGR",
        name=str(row.name or ""),
        aliases=parse_aliases_json(getattr(row, "aliases_json", None)),
        logo_url=logo_url,
        is_active=bool(getattr(row, "is_active", True)),
        created_at=getattr(row, "created_at", None),
        updated_at=getattr(row, "updated_at", None),
    )
