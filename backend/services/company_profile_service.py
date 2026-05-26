from __future__ import annotations

from sqlalchemy.orm import Session

from ..models.company_profile import CompanyProfile
from ..models.tenant import Tenant
from ..schemas.company_profile import CompanyProfileRead, CompanyProfileUpdate


def get_or_create_profile(db: Session, tenant_id: int) -> CompanyProfile:
    row = db.query(CompanyProfile).filter(CompanyProfile.tenant_id == int(tenant_id)).first()
    if row:
        return row
    tenant = db.query(Tenant).filter(Tenant.id == int(tenant_id)).first()
    if tenant is None:
        raise ValueError("tenant_not_found")
    row = CompanyProfile(tenant_id=int(tenant_id))
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def profile_to_read(row: CompanyProfile) -> CompanyProfileRead:
    return CompanyProfileRead.model_validate(row)


def apply_update(row: CompanyProfile, data: CompanyProfileUpdate) -> None:
    payload = data.model_dump(exclude_unset=True)
    for k, v in payload.items():
        setattr(row, k, v)


def get_company_profile_for_tenant(db: Session, tenant_id: int) -> CompanyProfileRead:
    """Public helper for PDF / invoices / exports — returns read DTO (creates empty shell if missing)."""
    row = get_or_create_profile(db, tenant_id)
    return profile_to_read(row)
