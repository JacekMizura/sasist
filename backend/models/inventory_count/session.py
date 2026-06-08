"""Active WMS operator sessions for multi-user parallel counting."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from ...database import Base
from ..base import BaseModelMixin
from .constants import SESSION_STATUS_ACTIVE


class InventorySession(Base, BaseModelMixin):
    __tablename__ = "inventory_sessions"

    inventory_document_id = Column(
        Integer,
        ForeignKey("inventory_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    inventory_task_id = Column(
        Integer,
        ForeignKey("inventory_tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)

    status = Column(String(32), nullable=False, default=SESSION_STATUS_ACTIVE, index=True)
    device_id = Column(String(128), nullable=True)
    scanner_profile = Column(String(64), nullable=True)

    current_location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    scan_count = Column(Integer, nullable=False, default=0)
    lines_counted = Column(Integer, nullable=False, default=0)

    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_activity_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    closed_at = Column(DateTime, nullable=True)

    # QR session token for mobile handoff (placeholder)
    session_token = Column(String(128), nullable=True, unique=True, index=True)
    metadata_json = Column(Text, nullable=True)

    def touch_activity(self) -> None:
        now = datetime.utcnow()
        self.last_activity_at = now
        self.updated_at = now
