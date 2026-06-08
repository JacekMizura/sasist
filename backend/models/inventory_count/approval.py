"""Immutable approval records for inventory documents."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from ...database import Base
from .constants import APPROVAL_ACTION_SUBMIT


class InventoryApproval(Base):
    __tablename__ = "inventory_approvals"

    id = Column(Integer, primary_key=True)
    inventory_document_id = Column(
        Integer,
        ForeignKey("inventory_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action = Column(String(32), nullable=False, default=APPROVAL_ACTION_SUBMIT, index=True)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)
    notes = Column(Text, nullable=True)
    detail_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
