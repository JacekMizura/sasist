"""Alternative recipe variants per product — MRP architecture (§11)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import relationship

from ..database import Base

VARIANT_STANDARD = "STANDARD"
VARIANT_ECONOMIC = "ECONOMIC"
VARIANT_EXPORT = "EXPORT"
VARIANT_EMERGENCY = "EMERGENCY"
VARIANT_CUSTOM = "CUSTOM"

VARIANT_CODES = (VARIANT_STANDARD, VARIANT_ECONOMIC, VARIANT_EXPORT, VARIANT_EMERGENCY, VARIANT_CUSTOM)


class ProductRecipeVariant(Base):
    """Logical recipe profile — maps to one active ProductComposition."""

    __tablename__ = "product_recipe_variants"
    __table_args__ = (
        UniqueConstraint("tenant_id", "product_id", "variant_code", name="uq_product_recipe_variant_code"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    composition_id = Column(Integer, ForeignKey("product_compositions.id", ondelete="CASCADE"), nullable=False, index=True)
    variant_code = Column(String(24), nullable=False, default=VARIANT_STANDARD)
    variant_label = Column(String(120), nullable=False, default="Receptura standardowa")
    priority = Column(Integer, nullable=False, default=10, server_default=text("10"))
    is_default = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    is_active = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    product = relationship("Product", foreign_keys=[product_id])
    composition = relationship("ProductComposition", foreign_keys=[composition_id])


class ProductionMaterialSubstitutionDecision(Base):
    """Operator accepted substitute — never auto-applied to BOM (§3)."""

    __tablename__ = "production_material_substitution_decisions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    production_batch_id = Column(Integer, ForeignKey("production_batches.id", ondelete="CASCADE"), nullable=True, index=True)
    production_order_id = Column(Integer, ForeignKey("production_orders.id", ondelete="CASCADE"), nullable=True, index=True)
    original_component_product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    substitute_product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    conversion_ratio = Column(Float, nullable=False, default=1.0)
    quantity_original = Column(Float, nullable=False, default=0.0)
    quantity_substitute = Column(Float, nullable=False, default=0.0)
    status = Column(String(16), nullable=False, default="accepted", index=True)
    decided_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    original_product = relationship("Product", foreign_keys=[original_component_product_id])
    substitute_product = relationship("Product", foreign_keys=[substitute_product_id])
