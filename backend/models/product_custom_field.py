"""Konfigurowalne dodatkowe pola produktu (asortyment)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base


class ProductCustomField(Base):
    """Definicja pola — tenant-scoped (bez warehouse)."""

    __tablename__ = "product_custom_fields"
    __table_args__ = (UniqueConstraint("tenant_id", "slug", name="uq_pcf_tenant_slug"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)

    name = Column(String(256), nullable=False)
    slug = Column(String(128), nullable=False, index=True)
    #: TEXT | NUMBER | FILES | SELECT_SINGLE | SELECT_MULTI | GPSR_ATTACHMENTS | ATTACHMENTS
    type = Column(String(32), nullable=False, index=True)

    settings_json = Column(Text, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)

    options = relationship(
        "ProductCustomFieldOption",
        back_populates="field",
        cascade="all, delete-orphan",
        order_by="ProductCustomFieldOption.sort_order",
    )
    values = relationship("ProductCustomFieldValue", back_populates="field", cascade="all, delete-orphan")


class ProductCustomFieldOption(Base):
    __tablename__ = "product_custom_field_options"

    id = Column(Integer, primary_key=True, autoincrement=True)
    field_id = Column(Integer, ForeignKey("product_custom_fields.id", ondelete="CASCADE"), nullable=False, index=True)
    label = Column(String(512), nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)

    field = relationship("ProductCustomField", back_populates="options")


class ProductCustomFieldValue(Base):
    __tablename__ = "product_custom_field_values"
    __table_args__ = (UniqueConstraint("product_id", "field_id", name="uq_pcfv_product_field"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    field_id = Column(Integer, ForeignKey("product_custom_fields.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)

    value_string = Column(Text, nullable=True)
    value_number = Column(Float, nullable=True)
    value_json = Column(Text, nullable=True)

    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)

    field = relationship("ProductCustomField", back_populates="values")
