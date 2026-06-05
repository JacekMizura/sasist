"""Mobile / Zebra device sessions — resumable operator workflows."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from ..database import Base

DEVICE_SESSION_ACTIVE = "ACTIVE"
DEVICE_SESSION_SUSPENDED = "SUSPENDED"
DEVICE_SESSION_CLOSED = "CLOSED"


class DeviceSession(Base):
    __tablename__ = "device_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    operator_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)

    device_key = Column(String(64), nullable=False, index=True)
    device_kind = Column(String(24), nullable=False, default="SCANNER")
    workflow_type = Column(String(32), nullable=False, default="PICKING")
    status = Column(String(16), nullable=False, default=DEVICE_SESSION_ACTIVE, index=True)

    battery_pct = Column(Integer, nullable=True)
    network_state = Column(String(16), nullable=True)
    payload_json = Column(Text, nullable=False, default="{}")

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_seen_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    suspended_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)
