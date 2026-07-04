"""Material substitutes — alternate products usable in production BOM."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import relationship

from ..database import Base


class ProductMaterialSubstitute(Base):
    __tablename__ = "product_material_substitutes"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "product_id",
            "substitute_product_id",
            name="uq_product_material_substitute",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    substitute_product_id = Column(
        Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    priority = Column(Integer, nullable=False, default=10, server_default=text("10"))
    conversion_ratio = Column(Float, nullable=False, default=1.0, server_default=text("1"))
    is_active = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    product = relationship("Product", foreign_keys=[product_id])
    substitute_product = relationship("Product", foreign_keys=[substitute_product_id])


class ProductionMaterialNeed(Base):
    """Open material gap tracked for production — bridge to Purchasing module."""

    __tablename__ = "production_material_needs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    component_product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    shortage_qty = Column(Float, nullable=False)
    status = Column(String(24), nullable=False, default="open", index=True)
    purchase_order_id = Column(Integer, ForeignKey("purchase_orders.id", ondelete="SET NULL"), nullable=True)
    purchase_order_item_id = Column(Integer, ForeignKey("purchase_order_items.id", ondelete="SET NULL"), nullable=True)
    source_ref_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    product = relationship("Product", foreign_keys=[component_product_id])
