"""Pydantic schemas for integration API keys."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..services.api_keys.constants import API_KEY_SCOPES, API_KEY_TYPES, DEFAULT_SCOPES_BY_TYPE
from ..services.api_keys.scopes import normalize_scope_list


class ApiKeyCreateBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    type: str = Field(..., min_length=1, max_length=32)
    description: str | None = Field(default=None, max_length=2000)
    warehouse_id: int | None = Field(default=None, ge=1)
    scopes: list[str] | None = None
    allowed_ips: list[str] | None = None
    expires_at: datetime | None = None

    @field_validator("type")
    @classmethod
    def _validate_type(cls, v: str) -> str:
        normalized = (v or "").strip().lower()
        if normalized not in API_KEY_TYPES:
            raise ValueError(f"type must be one of: {', '.join(sorted(API_KEY_TYPES))}")
        return normalized

    @field_validator("scopes")
    @classmethod
    def _validate_scopes(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        return normalize_scope_list(v)


class ApiKeyRead(BaseModel):
    id: int
    tenant_id: int
    name: str
    description: str | None = None
    key_prefix: str
    type: str
    scopes: list[str] = Field(default_factory=list)
    warehouse_id: int | None = None
    warehouse_name: str | None = None
    allowed_ips: list[str] = Field(default_factory=list)
    created_by: int | None = None
    created_by_user_id: int | None = None
    created_at: datetime | None = None
    last_used_at: datetime | None = None
    last_used_ip: str | None = None
    last_used_user_agent: str | None = None
    usage_count: int = 0
    expires_at: datetime | None = None
    revoked_at: datetime | None = None
    is_active: bool
    status: str

    model_config = ConfigDict(from_attributes=True)


class ApiKeyUsageRead(BaseModel):
    created_at: datetime | None = None
    last_used_at: datetime | None = None
    last_used_ip: str | None = None
    last_used_user_agent: str | None = None
    total_usage_count: int = 0


class ApiKeyCreateResponse(BaseModel):
    key: ApiKeyRead
    plain_key: str


class ApiKeyRegenerateResponse(BaseModel):
    key: ApiKeyRead
    plain_key: str


class ApiKeyRotateResponse(BaseModel):
    key: ApiKeyRead
    plain_key: str
    rotated_from_id: int


class ApiKeyListResponse(BaseModel):
    items: list[ApiKeyRead]


class ApiKeyScopeCatalogItem(BaseModel):
    scope: str
    label: str


class ApiKeyTypeDefaults(BaseModel):
    type: str
    scopes: list[str]


API_KEY_SCOPE_LABELS: dict[str, str] = {
    "printing.agent": "Printer Agent",
    "printing.read": "Printing (read)",
    "orders.read": "Orders (read)",
    "orders.write": "Orders (write)",
    "products.read": "Products (read)",
    "products.write": "Products (write)",
    "warehouse.read": "Warehouse (read)",
    "warehouse.write": "Warehouse (write)",
    "api.full_access": "Full API access",
}


def default_scope_catalog() -> list[ApiKeyTypeDefaults]:
    return [
        ApiKeyTypeDefaults(type=key_type, scopes=list(scopes))
        for key_type, scopes in DEFAULT_SCOPES_BY_TYPE.items()
    ]
