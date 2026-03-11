"""Schemas for label packs."""

from pydantic import BaseModel


class LabelPackGenerateBody(BaseModel):
    cart_id: int


class LabelPackItemResponse(BaseModel):
    id: int
    pack_id: int
    template_id: int
    object_type: str
    quantity_type: str


class LabelPackResponse(BaseModel):
    id: int
    name: str
    tenant_id: int
    items: list[LabelPackItemResponse] = []