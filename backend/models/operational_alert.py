"""Operational alerts — low stock, SLA, blocked pickup, etc."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from ..database import Base

ALERT_OPEN = "OPEN"
ALERT_ACK = "ACK"
ALERT_CLOSED = "CLOSED"


class OperationalAlert(Base):
    __tablename__ = "operational_alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)

    alert_type = Column(String(32), nullable=False, index=True)
    severity = Column(String(16), nullable=False, default="INFO")
    status = Column(String(16), nullable=False, default=ALERT_OPEN, index=True)
    title = Column(String(128), nullable=False)
    message = Column(Text, nullable=True)
    entity_type = Column(String(32), nullable=True)
    entity_id = Column(Integer, nullable=True)
    payload_json = Column(Text, nullable=False, default="{}")

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    acked_at = Column(DateTime, nullable=True)
    acked_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
