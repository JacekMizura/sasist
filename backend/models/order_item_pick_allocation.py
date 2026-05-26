"""Normalized pick allocation per order line (location + lot traceability)."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base
from .base import BaseModelMixin


class OrderItemPickAllocation(Base, BaseModelMixin):
    __tablename__ = "order_item_pick_allocations"

    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    order_item_id = Column(Integer, ForeignKey("order_items.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    pick_id = Column(Integer, ForeignKey("picks.id", ondelete="SET NULL"), nullable=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=False, index=True)
    batch_number = Column(String(128), nullable=False, default="")
    expiry_date = Column(Date, nullable=False, default=date(9999, 12, 31))
    serial_number = Column(String(128), nullable=False, default="")
    warehouse_carrier_id = Column(Integer, ForeignKey("warehouse_carriers.id", ondelete="SET NULL"), nullable=True)
    quantity = Column(Float, nullable=False)
    picked_by = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)
    picked_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    order = relationship("Order", foreign_keys=[order_id])
    order_item = relationship("OrderItem", foreign_keys=[order_item_id])
    product = relationship("Product", foreign_keys=[product_id])
    pick = relationship("Pick", foreign_keys=[pick_id])
    location = relationship("Location", foreign_keys=[location_id])
