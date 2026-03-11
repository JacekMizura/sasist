"""
SCHEMAS: Tenant

Warstwa Pydantic (API layer).
Brak logiki biznesowej.
"""

from pydantic import BaseModel, ConfigDict
from datetime import datetime


class TenantCreate(BaseModel):
    name: str


class TenantRead(BaseModel):
    id: int
    name: str
    created_at: datetime
    default_cart_template_id: int | None = None
    default_basket_template_id: int | None = None
    default_location_template_id: int | None = None

    model_config = ConfigDict(from_attributes=True)


class TenantLabelDefaultsUpdate(BaseModel):
    default_cart_template_id: int | None = None
    default_basket_template_id: int | None = None
    default_location_template_id: int | None = None
