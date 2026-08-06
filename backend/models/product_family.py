"""
Product Family — optional grouping of full Product rows (catalog).

Family only groups products and defines family attributes.
base_product_id is a copy source for the generator (not parent/master; no live inheritance).
"""

from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import relationship

from ..database import Base


class ProductFamily(Base):
    __tablename__ = "product_families"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    #: Copy source for generator only — not parent/master, no live inheritance.
    base_product_id = Column(
        Integer,
        ForeignKey("products.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    attributes = relationship(
        "FamilyAttribute",
        back_populates="family",
        cascade="all, delete-orphan",
        order_by="FamilyAttribute.sort_order",
    )


class FamilyAttribute(Base):
    """One dimension of a product family (e.g. Color, Size)."""

    __tablename__ = "family_attributes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    family_id = Column(
        Integer,
        ForeignKey("product_families.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    #: text | color | image
    display_type = Column(String(32), nullable=False, default="text")
    show_in_filters = Column(Boolean, nullable=False, default=False)
    sort_alpha = Column(Boolean, nullable=False, default=False)

    family = relationship("ProductFamily", back_populates="attributes")
    values = relationship(
        "FamilyAttributeValue",
        back_populates="attribute",
        cascade="all, delete-orphan",
        order_by="FamilyAttributeValue.sort_order",
    )


class FamilyAttributeValue(Base):
    """Concrete value on a family attribute (e.g. Red, M)."""

    __tablename__ = "family_attribute_values"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    attribute_id = Column(
        Integer,
        ForeignKey("family_attributes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    color_hex = Column(String(16), nullable=True)
    image_url = Column(String(1024), nullable=True)

    attribute = relationship("FamilyAttribute", back_populates="values")


class ProductAttributeValue(Base):
    """Selected family-attribute value for a product (one value per attribute)."""

    __tablename__ = "product_attribute_values"
    __table_args__ = (
        UniqueConstraint("product_id", "attribute_id", name="uq_product_attribute_value"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    attribute_id = Column(
        Integer,
        ForeignKey("family_attributes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    value_id = Column(
        Integer,
        ForeignKey("family_attribute_values.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime, nullable=False, server_default=func.now())
