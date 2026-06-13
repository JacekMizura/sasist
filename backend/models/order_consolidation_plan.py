"""P5 — consolidation plan: pull stock from multiple warehouses into one fulfillment warehouse."""

from __future__ import annotations

from sqlalchemy import Column, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base
from .base import BaseModelMixin


class OrderConsolidationPlan(Base, BaseModelMixin):
    __tablename__ = "order_consolidation_plans"

    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    target_warehouse_id = Column(
        Integer, ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status = Column(String(32), nullable=False, default="DRAFT", index=True)

    order = relationship("Order", backref="consolidation_plans")
    target_warehouse = relationship("Warehouse", foreign_keys=[target_warehouse_id])
    items = relationship(
        "OrderConsolidationPlanItem",
        back_populates="plan",
        cascade="all, delete-orphan",
    )


class OrderConsolidationPlanItem(Base, BaseModelMixin):
    __tablename__ = "order_consolidation_plan_items"

    plan_id = Column(
        Integer, ForeignKey("order_consolidation_plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id = Column(Integer, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity = Column(Float, nullable=False)
    source_warehouse_id = Column(
        Integer, ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    target_warehouse_id = Column(
        Integer, ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status = Column(String(32), nullable=False, default="WAITING", index=True)
    stock_document_id = Column(
        Integer, ForeignKey("stock_documents.id", ondelete="SET NULL"), nullable=True, index=True
    )

    plan = relationship("OrderConsolidationPlan", back_populates="items")
    product = relationship("Product")
    source_warehouse = relationship("Warehouse", foreign_keys=[source_warehouse_id])
    target_warehouse = relationship("Warehouse", foreign_keys=[target_warehouse_id])
    stock_document = relationship("StockDocument")
