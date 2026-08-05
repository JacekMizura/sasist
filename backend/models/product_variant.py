"""
Catalog product variants — reusable variant groups (axes + values) and product SKU links.

Hierarchy:
  VariantGroup → VariantAxis (e.g. Color, Size) → VariantValue (e.g. Red, M)
  Parent Product.variant_group_id → attaches a group
  Child Product.variant_parent_id → sellable SKU for one combination
  ProductVariantSelection → which values define that child SKU
"""

from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import relationship

from ..database import Base


class VariantGroup(Base):
    __tablename__ = "variant_groups"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    axes = relationship(
        "VariantAxis",
        back_populates="group",
        cascade="all, delete-orphan",
        order_by="VariantAxis.sort_order",
    )


class VariantAxis(Base):
    """One dimension of a variant group (Sellasist „opcja wariantu”)."""

    __tablename__ = "variant_axes"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("variant_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    #: text | color | image
    display_type = Column(String(32), nullable=False, default="text")
    show_in_filters = Column(Boolean, nullable=False, default=False)
    sort_alpha = Column(Boolean, nullable=False, default=False)

    group = relationship("VariantGroup", back_populates="axes")
    values = relationship(
        "VariantValue",
        back_populates="axis",
        cascade="all, delete-orphan",
        order_by="VariantValue.sort_order",
    )


class VariantValue(Base):
    """Concrete value on an axis (Sellasist „cecha”)."""

    __tablename__ = "variant_values"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    axis_id = Column(Integer, ForeignKey("variant_axes.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    color_hex = Column(String(16), nullable=True)
    image_url = Column(String(1024), nullable=True)

    axis = relationship("VariantAxis", back_populates="values")


class ProductVariantSelection(Base):
    """Links a child variant product to one value per axis."""

    __tablename__ = "product_variant_selections"
    __table_args__ = (
        UniqueConstraint("product_id", "variant_value_id", name="uq_product_variant_selection"),
    )

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    variant_value_id = Column(
        Integer,
        ForeignKey("variant_values.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime, nullable=False, server_default=func.now())
