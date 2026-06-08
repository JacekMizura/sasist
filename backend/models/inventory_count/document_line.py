"""Inventory count document line — expected vs counted per stock dimension."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, Index

from ...database import Base
from ..base import BaseModelMixin
from .constants import LINE_STATUS_OPEN


class InventoryDocumentLine(Base, BaseModelMixin):
    __tablename__ = "inventory_document_lines"
    __table_args__ = (
        Index("ix_inv_doc_lines_doc_loc", "inventory_document_id", "location_id"),
        Index("ix_inv_doc_lines_doc_prod", "inventory_document_id", "product_id"),
    )

    inventory_document_id = Column(
        Integer,
        ForeignKey("inventory_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="RESTRICT"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)

    expected_quantity = Column(Float, nullable=False, default=0.0)
    counted_quantity = Column(Float, nullable=True)
    difference_quantity = Column(Float, nullable=True)

    lot_id = Column(Integer, nullable=True)
    batch_number = Column(String(128), nullable=True)
    serial_number = Column(String(128), nullable=True)
    carrier_id = Column(Integer, ForeignKey("warehouse_carriers.id", ondelete="SET NULL"), nullable=True)

    status = Column(String(32), nullable=False, default=LINE_STATUS_OPEN, index=True)
    recount_count = Column(Integer, nullable=False, default=0)
    confidence_score = Column(Float, nullable=True)

    last_counted_at = Column(DateTime, nullable=True)
    last_counted_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    confirmed_at = Column(DateTime, nullable=True)
    confirmed_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)

    notes = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)

    def recompute_difference(self) -> None:
        if self.counted_quantity is None:
            self.difference_quantity = None
            return
        self.difference_quantity = float(self.counted_quantity) - float(self.expected_quantity or 0.0)

    def touch_updated(self) -> None:
        self.updated_at = datetime.utcnow()
