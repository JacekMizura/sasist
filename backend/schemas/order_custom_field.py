"""Pydantic — dodatkowe pola zamówienia."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

ORDER_CUSTOM_FIELD_TYPES = frozenset(
    {
        "TEXT",
        "NUMBER",
        "FILES",
        "SELECT_SINGLE",
        "SELECT_MULTI",
        "SALES_DOCUMENT",
        "SHIPPING_LABEL",
    }
)


class OrderCustomFieldOptionRead(BaseModel):
    id: int
    label: str
    icon_file_id: Optional[int] = None
    sort_order: int = 0


class OrderCustomFieldOptionWrite(BaseModel):
    id: Optional[int] = None
    label: str = Field(..., min_length=1, max_length=512)
    icon_file_id: Optional[int] = None
    sort_order: int = 0


class OrderCustomFieldRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    name: str
    slug: str
    type: str
    settings_json: Optional[Dict[str, Any]] = None
    icon_file_id: Optional[int] = None
    sort_order: int = 0
    is_active: bool = True
    options: List[OrderCustomFieldOptionRead] = Field(default_factory=list)


class OrderCustomFieldWrite(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    slug: Optional[str] = Field(None, max_length=128)
    type: str
    settings_json: Optional[Dict[str, Any]] = None
    icon_file_id: Optional[int] = None
    sort_order: int = 0
    is_active: bool = True
    options: List[OrderCustomFieldOptionWrite] = Field(default_factory=list)


class OrderCustomFieldValueStore(BaseModel):
    """Jedna wartość do zapisu — backend wybiera kolumnę na podstawie typu pola."""

    field_id: int
    string_value: Optional[str] = None
    number_value: Optional[float] = None
    json_value: Optional[Any] = None


class OrderCustomFieldValuesPutBody(BaseModel):
    values: List[OrderCustomFieldValueStore] = Field(default_factory=list)


class OrderCustomFieldValueState(BaseModel):
    field_id: int
    string_value: Optional[str] = None
    number_value: Optional[float] = None
    json_value: Optional[Any] = None


class OrderCustomFieldWithValueRead(BaseModel):
    field: OrderCustomFieldRead
    value: Optional[OrderCustomFieldValueState] = None


class OrderCustomFieldsBulkDeleteBody(BaseModel):
    ids: List[int] = Field(..., min_length=1)
