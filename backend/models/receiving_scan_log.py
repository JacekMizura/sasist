"""Audit log for WMS blind receiving quantity saves (per document line)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String

from ..database import Base


class ReceivingScanLog(Base):
    """One row per successful PATCH /wms/receiving/pz/.../items/... quantity save."""

    __tablename__ = "receiving_scan_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_id = Column(Integer, ForeignKey("stock_documents.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("stock_document_items.id", ondelete="CASCADE"), nullable=False, index=True)
    admin_id = Column(Integer, ForeignKey("app_users.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity_added = Column(Float, nullable=False)
    packaging_type = Column(String(32), nullable=False)
    cartons_added = Column(Integer, nullable=True)
    loose_units_added = Column(Integer, nullable=True)
    serial_number = Column(String(128), nullable=True)
    batch_number = Column(String(128), nullable=True)
    expiry_date = Column(Date, nullable=True)
    raw_scan = Column(String(512), nullable=True)
    scan_kind = Column(String(32), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
