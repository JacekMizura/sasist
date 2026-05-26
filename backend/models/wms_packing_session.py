"""Dedicated packing session — traceability per order (operator, workstation, duration)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base


class WmsPackingSession(Base):
    """
    One open session per order until packing completes (packed_at / PACKING_FINISHED).
    ``workstation_id`` mirrors ``user_wms_profiles.packing_station_id`` when known.
    """

    __tablename__ = "wms_packing_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)

    operator_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)
    workstation_id = Column(Integer, nullable=True, index=True)

    started_at = Column(DateTime, nullable=False)
    last_activity_at = Column(DateTime, nullable=True, index=True)
    completed_at = Column(DateTime, nullable=True)
    completed_reason = Column(String(32), nullable=True)
    #: Zamknięcie po zakończeniu automatyki (dokumenty / etykiety / status); razem z ``completed_at`` przy finish API.
    automation_finished_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)

    metadata_json = Column(Text, nullable=True)

    order = relationship("Order", back_populates="wms_packing_sessions")
