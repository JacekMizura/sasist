from typing import Any, Literal

from pydantic import BaseModel, Field

ExportEntityType = Literal[
    "products",
    "sets",
    "orders",
    "cartons",
    "suppliers",
    "manufacturers",
    "customers",
    "label_templates",
]


class ExportTemplateCreate(BaseModel):
    tenant_id: int = Field(..., ge=1)
    name: str = Field(..., min_length=1, max_length=256)
    type: ExportEntityType
    fields_json: list[str]
    is_active: bool = True


class ExportTemplateUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=256)
    type: ExportEntityType | None = None
    fields_json: list[str] | None = None
    is_active: bool | None = None


class ExportTemplateRead(BaseModel):
    id: int
    tenant_id: int
    name: str
    type: str
    fields_json: list[str]
    is_active: bool
    created_at: str | None

    class Config:
        from_attributes = True


class ExportRunRequest(BaseModel):
    tenant_id: int = Field(..., ge=1)
    template_id: int = Field(..., ge=1)
    ids: list[Any] = Field(default_factory=list)
