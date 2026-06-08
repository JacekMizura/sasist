"""Raw inventory count events — every scan and quantity change."""

from __future__ import annotations

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, Index
from datetime import datetime

from ...database import Base
from .constants import ENTRY_SOURCE_SCANNER


class InventoryCountEntry(Base):
    __tablename__ = "inventory_count_entries"
    __table_args__ = (
        Index("ix_inv_count_entries_line_created", "inventory_document_line_id", "created_at"),
    )

    id = Column(Integer, primary_key=True)
    inventory_document_line_id = Column(
        Integer,
        ForeignKey("inventory_document_lines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    inventory_document_id = Column(
        Integer,
        ForeignKey("inventory_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)
    scanner_session_id = Column(Integer, ForeignKey("inventory_sessions.id", ondelete="SET NULL"), nullable=True)

    counted_quantity = Column(Float, nullable=False)
    delta_quantity = Column(Float, nullable=True)
    source = Column(String(32), nullable=False, default=ENTRY_SOURCE_SCANNER)
    barcode_value = Column(String(256), nullable=True)
    device_id = Column(String(128), nullable=True)

    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
