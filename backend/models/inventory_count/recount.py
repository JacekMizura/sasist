"""Recount workflow — mandatory second count when difference exceeds threshold."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text

from ...database import Base
from ..base import BaseModelMixin
from .constants import RECOUNT_STATUS_OPEN


class InventoryRecount(Base, BaseModelMixin):
    __tablename__ = "inventory_recounts"

    inventory_document_id = Column(
        Integer,
        ForeignKey("inventory_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    inventory_document_line_id = Column(
        Integer,
        ForeignKey("inventory_document_lines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    inventory_task_id = Column(
        Integer,
        ForeignKey("inventory_tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    status = Column(String(32), nullable=False, default=RECOUNT_STATUS_OPEN, index=True)
    reason = Column(String(64), nullable=False, default="threshold_exceeded")
    difference_percent = Column(Float, nullable=True)
    difference_quantity = Column(Float, nullable=True)

    assigned_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)
    assigned_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    completed_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)

    original_counted_quantity = Column(Float, nullable=True)
    recount_counted_quantity = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
