"""Shared product composition engine — bundle + manufacturing modes (no product_type enums)."""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, text
from sqlalchemy.orm import relationship

from ..database import Base

COMPOSITION_MODES = frozenset({"bundle", "manufacturing"})


class ProductComposition(Base):
    __tablename__ = "product_compositions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    composition_mode = Column(String(32), nullable=False, index=True)  # bundle | manufacturing
    name = Column(String(256), nullable=False)
    version = Column(String(32), nullable=False, default="1")
    is_active = Column(Boolean, nullable=False, default=False, server_default=text("false"), index=True)
    yield_quantity = Column(Float, nullable=False, default=1.0)
    notes = Column(Text, nullable=True)
    #: Set during migration from production_recipes for backward compatibility.
    source_recipe_id = Column(Integer, nullable=True, unique=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    product = relationship("Product", foreign_keys=[product_id])
    lines = relationship(
        "ProductCompositionLine",
        back_populates="composition",
        cascade="all, delete-orphan",
        order_by="ProductCompositionLine.sort_order",
    )


class ProductCompositionLine(Base):
    __tablename__ = "product_composition_lines"

    id = Column(Integer, primary_key=True, autoincrement=True)
    composition_id = Column(
        Integer,
        ForeignKey("product_compositions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    component_product_id = Column(Integer, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity = Column(Float, nullable=False)
    waste_percent = Column(Float, nullable=False, default=0.0)
    sort_order = Column(Integer, nullable=False, default=0)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    composition = relationship("ProductComposition", back_populates="lines")
    component_product = relationship("Product", foreign_keys=[component_product_id])


class ProductionBatch(Base):
    __tablename__ = "production_batches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    number = Column(String(64), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True)
    status = Column(String(32), nullable=False, default="draft", index=True)
    notes = Column(Text, nullable=True)
    rw_stock_document_id = Column(Integer, ForeignKey("stock_documents.id", ondelete="SET NULL"), nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    #: JSON: collecting tasks progress (collector-ready).
    collection_state_json = Column(Text, nullable=True)
    materials_reserved = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    reservations_locked_at = Column(DateTime, nullable=True)
    #: WMS | ERP — UI interface chosen at production start; same backend workflow.
    execution_interface = Column(String(16), nullable=True, index=True)
    released_to_wms_at = Column(DateTime, nullable=True)
    released_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    started_at = Column(DateTime, nullable=True)
    collecting_completed_at = Column(DateTime, nullable=True)
    production_completed_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
    lines = relationship(
        "ProductionBatchLine",
        back_populates="batch",
        cascade="all, delete-orphan",
        order_by="ProductionBatchLine.id",
    )


class ProductionBatchLine(Base):
    __tablename__ = "production_batch_lines"

    id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(Integer, ForeignKey("production_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    composition_id = Column(Integer, ForeignKey("product_compositions.id", ondelete="RESTRICT"), nullable=False)
    planned_quantity = Column(Float, nullable=False)
    completed_quantity = Column(Float, nullable=False, default=0.0)
    target_location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(32), nullable=False, default="planned")
    calculated_unit_cost = Column(Float, nullable=True)
    pw_stock_document_id = Column(Integer, ForeignKey("stock_documents.id", ondelete="SET NULL"), nullable=True)
    notes = Column(Text, nullable=True)

    batch = relationship("ProductionBatch", back_populates="lines")
    product = relationship("Product", foreign_keys=[product_id])
    composition = relationship("ProductComposition", foreign_keys=[composition_id])
    target_location = relationship("Location", foreign_keys=[target_location_id])
