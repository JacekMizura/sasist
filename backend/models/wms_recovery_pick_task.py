"""Tymczasowe zadanie dogrywki zbierki po decyzji OMS (recovery_pick) — stan operacyjny WMS."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from ..database import Base


class WmsRecoveryPickTask(Base):
    """Jedna krotka na zamówienie — status ``open`` | ``done`` | ``cancelled`` (ponowne otwarcie = UPDATE)."""
    __tablename__ = "wms_recovery_pick_tasks"
    __table_args__ = (UniqueConstraint("tenant_id", "warehouse_id", "order_id", name="uq_wms_recovery_pick_order"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)

    #: open | done | cancelled
    status = Column(String(16), nullable=False, default="open")

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)
