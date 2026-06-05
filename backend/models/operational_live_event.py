"""Persisted live events for SSE replay and observability."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from ..database import Base


class OperationalLiveEvent(Base):
    __tablename__ = "operational_live_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)

    event_type = Column(String(48), nullable=False, index=True)
    channel = Column(String(32), nullable=False, default="warehouse")
    revision = Column(String(64), nullable=True)
    payload_json = Column(Text, nullable=False, default="{}")

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
