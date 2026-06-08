"""Unknown / unmapped products found during WMS inventory execution."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, Index

from ...database import Base
from ..base import BaseModelMixin


class InventoryUnknownProduct(Base, BaseModelMixin):
    __tablename__ = "inventory_unknown_products"
    __table_args__ = (
        Index("ix_inv_unknown_doc_status", "inventory_document_id", "status"),
        Index("ix_inv_unknown_task", "inventory_task_id"),
    )

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
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="RESTRICT"), nullable=False, index=True)

    temporary_name = Column(String(256), nullable=False)
    barcode_value = Column(String(128), nullable=True, index=True)
    quantity = Column(Float, nullable=False, default=1.0)
    notes = Column(Text, nullable=True)
    photo_url = Column(String(512), nullable=True)

    status = Column(String(32), nullable=False, default="draft", index=True)
    mapped_product_id = Column(Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)
    mapped_at = Column(DateTime, nullable=True)
    mapped_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)

    reported_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)
    inventory_session_id = Column(
        Integer,
        ForeignKey("inventory_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )

    def touch_updated(self) -> None:
        self.updated_at = datetime.utcnow()
