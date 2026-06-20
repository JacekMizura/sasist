from typing import Optional

from pydantic import BaseModel, Field, field_validator

from ..catalog.business_entity_validators import validate_tax_id_optional
from ..catalog.supplier_taxonomy import validate_supplier_country, validate_supplier_currency


def _strip_opt_field(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


class SupplierRead(BaseModel):
    id: int
    tenant_id: int
    name: str
    company_name: Optional[str] = None
    tax_id: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    street: Optional[str] = None
    address: Optional[str] = None
    active: bool = True
    default_lead_time_days: Optional[int] = None
    default_currency: Optional[str] = None
    minimum_order_value: Optional[float] = None
    minimum_order_qty: Optional[int] = None
    free_shipping_threshold: Optional[float] = None
    offers_free_shipping: bool = True
    requires_moq: bool = True
    notes: Optional[str] = None
    product_count: int = 0
    delivery_count: int = 0
    is_incomplete: bool = False
    country_is_eu: Optional[bool] = Field(
        default=None,
        description="Derived from catalog when country is known; null for legacy/unknown DB values.",
    )


class SupplierCreateBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    name: str = Field(..., min_length=1)
    company_name: Optional[str] = None
    tax_id: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    street: Optional[str] = None
    address: Optional[str] = None
    active: bool = True
    default_lead_time_days: Optional[int] = Field(None, ge=0)
    default_currency: Optional[str] = Field(None, max_length=8)
    minimum_order_value: Optional[float] = Field(None, ge=0)
    minimum_order_qty: Optional[int] = Field(None, ge=0)
    free_shipping_threshold: Optional[float] = Field(None, ge=0)
    offers_free_shipping: bool = True
    requires_moq: bool = True
    notes: Optional[str] = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("name is required")
        return s

    @field_validator("company_name", "city", "postal_code", "street", "address", mode="before")
    @classmethod
    def strip_optional_text(cls, v: Optional[str]) -> Optional[str]:
        return _strip_opt_field(v)

    @field_validator("tax_id", mode="before")
    @classmethod
    def tax_id_opt(cls, v: Optional[str]) -> Optional[str]:
        return validate_tax_id_optional(v if v is None or isinstance(v, str) else str(v))

    @field_validator("country")
    @classmethod
    def country_allowed(cls, v: Optional[str]) -> Optional[str]:
        return validate_supplier_country(v)

    @field_validator("default_currency")
    @classmethod
    def currency_allowed(cls, v: Optional[str]) -> Optional[str]:
        return validate_supplier_currency(v)


class SupplierUpdateBody(BaseModel):
    name: str = Field(..., min_length=1)
    company_name: Optional[str] = None
    tax_id: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    street: Optional[str] = None
    address: Optional[str] = None
    active: bool = True
    default_lead_time_days: Optional[int] = Field(None, ge=0)
    default_currency: Optional[str] = Field(None, max_length=8)
    minimum_order_value: Optional[float] = Field(None, ge=0)
    minimum_order_qty: Optional[int] = Field(None, ge=0)
    free_shipping_threshold: Optional[float] = Field(None, ge=0)
    offers_free_shipping: bool = True
    requires_moq: bool = True
    notes: Optional[str] = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("name is required")
        return s

    @field_validator("company_name", "city", "postal_code", "street", "address", mode="before")
    @classmethod
    def strip_optional_text_update(cls, v: Optional[str]) -> Optional[str]:
        return _strip_opt_field(v)

    @field_validator("tax_id", mode="before")
    @classmethod
    def tax_id_opt_update(cls, v: Optional[str]) -> Optional[str]:
        return validate_tax_id_optional(v if v is None or isinstance(v, str) else str(v))

    @field_validator("country")
    @classmethod
    def country_allowed_update(cls, v: Optional[str]) -> Optional[str]:
        return validate_supplier_country(v)

    @field_validator("default_currency")
    @classmethod
    def currency_allowed_update(cls, v: Optional[str]) -> Optional[str]:
        return validate_supplier_currency(v)
