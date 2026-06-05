"""Persisted operational commerce events — versioned, immutable audit stream."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text

from ..database import Base


class OperationalCommerceEvent(Base):
    __tablename__ = "operational_commerce_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True)
    event = Column(String(64), nullable=False, index=True)
    version = Column(Integer, nullable=False, default=1)
    occurred_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    session_id = Column(Integer, ForeignKey("direct_sale_sessions.id", ondelete="SET NULL"), nullable=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    qty = Column(Float, nullable=True)
    source = Column(String(64), nullable=True)
    performed_by_user_id = Column(Integer, nullable=True)
    device_id = Column(Integer, nullable=True)
    payload_json = Column(Text, nullable=False)
