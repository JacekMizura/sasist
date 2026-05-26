"""Manufacturer (producer) — tenant-scoped; products link via manufacturer_id."""

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base


class Manufacturer(Base):
    __tablename__ = "manufacturers"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String, nullable=False)
    company_name = Column(String, nullable=True)
    tax_id = Column(String, nullable=True)
    logo_url = Column(String, nullable=True)
    country = Column(String, nullable=True)
    city = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)
    street = Column(Text, nullable=True)
    website = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    active = Column(Boolean, nullable=False, default=True)

    responsible_person_name = Column(String, nullable=True)
    responsible_person_email = Column(String, nullable=True)

    tenant = relationship("Tenant", back_populates="manufacturers", foreign_keys=[tenant_id])
    products = relationship("Product", back_populates="manufacturer_row", foreign_keys="Product.manufacturer_id")
