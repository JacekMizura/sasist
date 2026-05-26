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
    default_warehouse_id: int | None = None
    default_cart_template_id: int | None = None
    default_basket_template_id: int | None = None
    default_location_template_id: int | None = None
    #: Business profile (used by document series “load from tenant” and PDFs).
    company_name: str | None = None
    tax_id: str | None = None
    email: str | None = None
    phone: str | None = None
    country: str | None = None
    city: str | None = None
    postal_code: str | None = None
    street: str | None = None
    address: str | None = None

    model_config = ConfigDict(from_attributes=True)


class TenantLabelDefaultsUpdate(BaseModel):
    default_cart_template_id: int | None = None
    default_basket_template_id: int | None = None
    default_location_template_id: int | None = None
