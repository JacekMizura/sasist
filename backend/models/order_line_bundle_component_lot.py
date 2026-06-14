"""P4.16 — Lot traceability snapshot for bundle components (written at pick/issue, not at order create)."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base
from .base import BaseModelMixin


class OrderLineBundleComponentLot(Base, BaseModelMixin):
    __tablename__ = "order_line_bundle_component_lots"

    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    order_line_id = Column(
        Integer,
        ForeignKey("order_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="Parent bundle order line id",
    )
    bundle_component_snapshot_id = Column(
        Integer,
        ForeignKey("order_line_bundle_components.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id = Column(Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)
    lot_id = Column(Integer, nullable=True, index=True, doc="Synthetic or inventory-derived lot key")
    lot_number = Column(String(128), nullable=False, default="")
    expiry_date = Column(Date, nullable=True)
    picked_qty = Column(Float, nullable=False)
    picked_at = Column(DateTime, nullable=False, index=True)
    pick_task_id = Column(Integer, ForeignKey("pick_tasks.id", ondelete="SET NULL"), nullable=True, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)

    order = relationship("Order", foreign_keys=[order_id])
    order_line = relationship("OrderItem", foreign_keys=[order_line_id])
    snapshot = relationship("OrderLineBundleComponent", foreign_keys=[bundle_component_snapshot_id])
    product = relationship("Product", foreign_keys=[product_id])
    pick_task = relationship("PickTask", foreign_keys=[pick_task_id])
    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
