"""Warehouse manufacturing — recipes and production orders (no product type enums)."""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, text
from sqlalchemy.orm import relationship

from ..database import Base


class ProductionRecipe(Base):
    __tablename__ = "production_recipes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(256), nullable=False)
    version = Column(String(32), nullable=False, default="1")
    is_active = Column(Boolean, nullable=False, default=False, server_default=text("false"), index=True)
    yield_quantity = Column(Float, nullable=False, default=1.0)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    product = relationship("Product", foreign_keys=[product_id])
    lines = relationship(
        "ProductionRecipeLine",
        back_populates="recipe",
        cascade="all, delete-orphan",
        order_by="ProductionRecipeLine.sort_order",
    )


class ProductionRecipeLine(Base):
    __tablename__ = "production_recipe_lines"

    id = Column(Integer, primary_key=True, autoincrement=True)
    recipe_id = Column(Integer, ForeignKey("production_recipes.id", ondelete="CASCADE"), nullable=False, index=True)
    component_product_id = Column(Integer, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity = Column(Float, nullable=False)
    waste_percent = Column(Float, nullable=False, default=0.0)
    sort_order = Column(Integer, nullable=False, default=0)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    recipe = relationship("ProductionRecipe", back_populates="lines")
    component_product = relationship("Product", foreign_keys=[component_product_id])


class ProductionOrder(Base):
    __tablename__ = "production_orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    number = Column(String(64), nullable=False, index=True)
    recipe_id = Column(Integer, ForeignKey("production_recipes.id", ondelete="RESTRICT"), nullable=True)
    composition_id = Column(Integer, ForeignKey("product_compositions.id", ondelete="RESTRICT"), nullable=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    planned_quantity = Column(Float, nullable=False)
    produced_quantity = Column(Float, nullable=False, default=0.0)
    status = Column(String(32), nullable=False, default="draft", index=True)
    priority = Column(Integer, nullable=False, default=0)
    notes = Column(Text, nullable=True)
    calculated_unit_cost = Column(Float, nullable=True)
    rw_stock_document_id = Column(Integer, ForeignKey("stock_documents.id", ondelete="SET NULL"), nullable=True)
    pw_stock_document_id = Column(Integer, ForeignKey("stock_documents.id", ondelete="SET NULL"), nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    collection_state_json = Column(Text, nullable=True)
    released_to_wms_at = Column(DateTime, nullable=True)
    released_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    collecting_completed_at = Column(DateTime, nullable=True)
    production_completed_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    recipe = relationship("ProductionRecipe", foreign_keys=[recipe_id])
    product = relationship("Product", foreign_keys=[product_id])
    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
    location = relationship("Location", foreign_keys=[location_id])
    line_snapshots = relationship(
        "ProductionOrderLineSnapshot",
        back_populates="production_order",
        cascade="all, delete-orphan",
        order_by="ProductionOrderLineSnapshot.id",
    )


class ProductionOrderLineSnapshot(Base):
    __tablename__ = "production_order_lines_snapshot"

    id = Column(Integer, primary_key=True, autoincrement=True)
    production_order_id = Column(
        Integer,
        ForeignKey("production_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    component_product_id = Column(Integer, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity_per_unit = Column(Float, nullable=False)
    total_required_quantity = Column(Float, nullable=False)
    consumed_quantity = Column(Float, nullable=False, default=0.0)
    product_name_snapshot = Column(String(512), nullable=False, default="")
    product_sku_snapshot = Column(String(128), nullable=True)
    #: Optional JSON list of {location_id, quantity} for mobile/collector flows.
    allocation_json = Column(Text, nullable=True)

    production_order = relationship("ProductionOrder", back_populates="line_snapshots")
    component_product = relationship("Product", foreign_keys=[component_product_id])
