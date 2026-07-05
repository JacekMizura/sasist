"""Global Twig context — company, tenant, warehouse, operator, branding."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.app_user import AppUser
from ...models.company_profile import CompanyProfile
from ...models.tenant import Tenant
from ...models.warehouse import Warehouse
from ..dto.print_context import GlobalPrintContext, dto_to_dict


def build_global_print_context_dto(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
    operator_user_id: int | None = None,
    language: str = "pl",
    currency: str = "PLN",
) -> GlobalPrintContext:
    now = datetime.utcnow()
    tenant = db.query(Tenant).filter(Tenant.id == int(tenant_id)).first()
    profile = db.query(CompanyProfile).filter(CompanyProfile.tenant_id == int(tenant_id)).first()
    warehouse = (
        db.query(Warehouse).filter(Warehouse.id == int(warehouse_id)).first()
        if warehouse_id
        else None
    )
    operator = (
        db.query(AppUser).filter(AppUser.id == int(operator_user_id)).first()
        if operator_user_id
        else None
    )

    company = {
        "name": _first_str(profile, "company_name") or _first_str(tenant, "company_name") or _first_str(tenant, "name"),
        "nip": _first_str(profile, "nip") or _first_str(tenant, "tax_id"),
        "regon": _first_str(profile, "regon"),
        "street": _street_line(profile, tenant),
        "city": _first_str(profile, "city") or _first_str(tenant, "city"),
        "postal_code": _first_str(profile, "postal_code") or _first_str(tenant, "postal_code"),
        "country": _first_str(profile, "country") or _first_str(tenant, "country") or "Polska",
        "email": _first_str(profile, "document_email") or _first_str(tenant, "email"),
        "phone": _first_str(profile, "company_phone") or _first_str(tenant, "phone"),
        "website": _first_str(profile, "website_url"),
        "bank_name": _first_str(profile, "bank_name"),
        "iban": _first_str(profile, "iban"),
        "bic_swift": _first_str(profile, "bic_swift"),
    }
    logo = _first_str(profile, "logo_url")
    dto = GlobalPrintContext(
        company=company,
        tenant={
            "id": int(tenant_id),
            "name": _first_str(tenant, "name"),
        },
        warehouse={
            "id": int(warehouse.id) if warehouse else None,
            "name": _first_str(warehouse, "name"),
            "code": _first_str(warehouse, "code"),
        },
        operator={
            "id": int(operator.id) if operator else None,
            "name": _first_str(operator, "display_name") or _first_str(operator, "username"),
            "full_name": _first_str(operator, "display_name") or _first_str(operator, "username"),
            "email": _first_str(operator, "email"),
        },
        settings={
            "currency": currency,
            "language": language,
        },
        branding={
            "logo_url": logo,
            "primary_color": "#2563eb",
            "font_family": "Arial, Helvetica, sans-serif",
        },
        theme={
            "font_size_base": "10px",
            "text_color": "#111111",
            "muted_color": "#555555",
            "border_color": "#bbbbbb",
        },
        system={
            "name": "Sasist",
            "version": "1.0",
        },
        meta={
            "generated_at": now.strftime("%d.%m.%Y %H:%M"),
        },
        current_datetime=now.strftime("%d.%m.%Y %H:%M"),
        today=now.strftime("%d.%m.%Y"),
        now=now.strftime("%H:%M"),
        logo=logo,
        currency=currency,
        language=language,
    )
    return dto


def build_global_print_context(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
    operator_user_id: int | None = None,
    language: str = "pl",
    currency: str = "PLN",
) -> dict[str, Any]:
    """Backward-compatible dict export — prefer build_global_print_context_dto()."""
    return dto_to_dict(
        build_global_print_context_dto(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            operator_user_id=operator_user_id,
            language=language,
            currency=currency,
        )
    )


def _first_str(obj: Any, attr: str) -> str | None:
    if obj is None:
        return None
    val = getattr(obj, attr, None)
    text = str(val).strip() if val is not None else ""
    return text or None


def _street_line(profile: CompanyProfile | None, tenant: Tenant | None) -> str | None:
    if profile is not None:
        parts = [
            _first_str(profile, "street"),
            _first_str(profile, "building_number"),
        ]
        apt = _first_str(profile, "apartment_number")
        line = " ".join(p for p in parts if p)
        if apt:
            line = f"{line}/{apt}" if line else apt
        extra = _first_str(profile, "address_extra_line")
        if line and extra:
            return f"{line}, {extra}"
        if line:
            return line
        if extra:
            return extra
    return _first_str(tenant, "street") or _first_str(tenant, "address")
