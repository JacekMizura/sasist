"""Generated inventory report metadata — PDF/XLSX artifacts."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from ...database import Base
from .constants import REPORT_FORMAT_XLSX


class InventoryReport(Base):
    __tablename__ = "inventory_reports"

    id = Column(Integer, primary_key=True)
    inventory_document_id = Column(
        Integer,
        ForeignKey("inventory_documents.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    report_kind = Column(String(64), nullable=False, index=True)
    report_format = Column(String(16), nullable=False, default=REPORT_FORMAT_XLSX)
    file_name = Column(String(256), nullable=False)
    storage_path = Column(String(512), nullable=True)
    checksum = Column(String(64), nullable=True)
    row_count = Column(Integer, nullable=False, default=0)
    generated_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    generated_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    metadata_json = Column(Text, nullable=True)
