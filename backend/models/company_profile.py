"""Company branding and legal profile — one row per tenant (source of truth for documents / PDF / KSeF)."""

from __future__ import annotations

from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint

from ..database import Base


class CompanyProfile(Base):
    __tablename__ = "company_profiles"
    __table_args__ = (UniqueConstraint("tenant_id", name="uq_company_profile_tenant"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)

    company_name = Column(String(512), nullable=True)
    street = Column(String(256), nullable=True)
    building_number = Column(String(32), nullable=True)
    apartment_number = Column(String(32), nullable=True)
    postal_code = Column(String(32), nullable=True)
    city = Column(String(128), nullable=True)
    country = Column(String(128), nullable=True)
    nip = Column(String(32), nullable=True)
    regon = Column(String(32), nullable=True)
    address_extra_line = Column(String(512), nullable=True)

    bank_name = Column(String(256), nullable=True)
    iban = Column(String(64), nullable=True)
    bic_swift = Column(String(32), nullable=True)
    document_email = Column(String(256), nullable=True)
    company_phone = Column(String(64), nullable=True)
    website_url = Column(String(512), nullable=True)

    logo_url = Column(String(512), nullable=True)
