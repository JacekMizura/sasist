"""Miękkie rezerwacje dogrywki — przydział przyrostu stanu do braków (bez mutacji workflow)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String

from ..database import Base


class WmsRecoverySoftReservation(Base):
    """
    Soft reservation for shortage recovery. status: soft | consumed | released
    Does not mutate order workflow — resolver remains SSOT.
    """

    __tablename__ = "wms_recovery_soft_reservations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    order_item_id = Column(Integer, ForeignKey("order_items.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)

    qty_reserved = Column(Float, nullable=False, default=0.0)
    qty_consumed = Column(Float, nullable=False, default=0.0)
    priority_score = Column(Integer, nullable=False, default=0)
    source_event = Column(String(64), nullable=True)
    status = Column(String(16), nullable=False, default="soft", index=True)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)
