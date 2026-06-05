"""Grupowa sesja dogrywki — wiele zamówień w jednej trasie magazynowej."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from ..database import Base


class WmsRecoveryBatchSession(Base):
    """
    RecoveryBatchSession — wiele order_id + linie dogrywki, metadane trasy.
    Status: open | active | done | cancelled
    """

    __tablename__ = "wms_recovery_batch_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    operator_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)

    label = Column(String(64), nullable=False, default="")
    status = Column(String(16), nullable=False, default="open", index=True)
    payload_json = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)
