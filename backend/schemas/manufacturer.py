from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from ..catalog.business_entity_validators import validate_tax_id_optional
from ..catalog.supplier_taxonomy import validate_supplier_country


class ManufacturerProductBrief(BaseModel):
    id: int
    name: Optional[str] = None
    symbol: Optional[str] = None
    ean: Optional[str] = None


class ManufacturerSupplierBrief(BaseModel):
    """Distinct supplier offering at least one product of this manufacturer (via supplier_products)."""

    supplier_id: int
    name: str
    active: bool = True
    linked_product_count: int = Field(
        ...,
        ge=0,
        description="Number of this manufacturer's products in the supplier's catalog",
    )


class ManufacturerRead(BaseModel):
    id: int
    tenant_id: int
    name: str
    company_name: Optional[str] = None
    tax_id: Optional[str] = None
    logo_url: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    street: Optional[str] = None
    website: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    active: bool = True
    responsible_person_name: Optional[str] = None
    responsible_person_email: Optional[str] = None
    product_count: int = Field(
        0,
        description="Number of products with manufacturer_id = this manufacturer (catalog only; not derived from inventory).",
    )
    total_inventory_quantity: float = Field(
        0.0,
        description="Sum of inventory.quantity for those products (separate from product_count).",
    )
    supplier_count: int = Field(
        0,
        ge=0,
        description="Distinct suppliers offering at least one product of this manufacturer.",
    )
    out_of_stock_product_count: int = Field(
        0,
        description="How many of those products have zero or missing inventory quantity.",
    )


class ManufacturerDetailRead(ManufacturerRead):
    products: List[ManufacturerProductBrief] = Field(default_factory=list)


def _strip_opt_field(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


class ManufacturerCreateBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    name: str = Field(..., min_length=1)
    company_name: Optional[str] = None
    tax_id: Optional[str] = None
    logo_url: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    street: Optional[str] = None
    website: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    active: bool = True
    responsible_person_name: Optional[str] = None
    responsible_person_email: Optional[str] = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("name is required")
        return s

    @field_validator("company_name", "city", "postal_code", "street", mode="before")
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


class ManufacturerUpdateBody(BaseModel):
    name: str = Field(..., min_length=1)
    company_name: Optional[str] = None
    tax_id: Optional[str] = None
    logo_url: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    street: Optional[str] = None
    website: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    active: bool = True
    responsible_person_name: Optional[str] = None
    responsible_person_email: Optional[str] = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("name is required")
        return s

    @field_validator("company_name", "city", "postal_code", "street", mode="before")
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
