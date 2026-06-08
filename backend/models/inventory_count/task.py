"""WMS counting tasks — location-scoped work units for operators."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, Index

from ...database import Base
from ..base import BaseModelMixin
from .constants import TASK_STATUS_OPEN


class InventoryTask(Base, BaseModelMixin):
    __tablename__ = "inventory_tasks"
    __table_args__ = (
        Index("ix_inv_tasks_doc_status", "inventory_document_id", "status"),
        Index("ix_inv_tasks_wh_status", "warehouse_id", "status"),
    )

    inventory_document_id = Column(
        Integer,
        ForeignKey("inventory_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="RESTRICT"), nullable=False, index=True)

    task_number = Column(String(64), nullable=False)
    status = Column(String(32), nullable=False, default=TASK_STATUS_OPEN, index=True)
    priority = Column(Integer, nullable=False, default=50)

    assigned_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)
    assigned_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    line_count = Column(Integer, nullable=False, default=0)
    counted_line_count = Column(Integer, nullable=False, default=0)
    progress_percent = Column(Integer, nullable=False, default=0)

    sequence_no = Column(Integer, nullable=False, default=0)
    zone_code = Column(String(64), nullable=True)
    aisle_code = Column(String(64), nullable=True)

    metadata_json = Column(Text, nullable=True)

    def touch_updated(self) -> None:
        self.updated_at = datetime.utcnow()
