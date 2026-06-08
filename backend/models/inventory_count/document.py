"""Inventory count document header — ERP planning & lifecycle."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from ...database import Base
from ..base import BaseModelMixin
from .constants import (
    COUNT_MODE_BLIND,
    INV_STATUS_DRAFT,
    INV_TYPE_FULL,
    LOCK_MODE_SNAPSHOT,
)


class InventoryDocument(Base, BaseModelMixin):
    __tablename__ = "inventory_documents"
    __table_args__ = (
        UniqueConstraint("tenant_id", "number", name="uq_inventory_documents_tenant_number"),
    )

    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True)
    number = Column(String(64), nullable=False)
    inventory_type = Column(String(32), nullable=False, default=INV_TYPE_FULL)
    status = Column(String(32), nullable=False, default=INV_STATUS_DRAFT, index=True)

    snapshot_created_at = Column(DateTime, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    posted_at = Column(DateTime, nullable=True)

    created_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    approved_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    posted_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)

    # Strategy
    count_mode = Column(String(32), nullable=False, default=COUNT_MODE_BLIND)
    lock_mode = Column(String(32), nullable=False, default=LOCK_MODE_SNAPSHOT)
    recount_required = Column(Integer, nullable=False, default=0)
    scan_mode = Column(String(32), nullable=False, default="scan_increment")

    # Partial inventory filters + future features (ABC automation, heatmap scope, QR session)
    filters_json = Column(Text, nullable=True)
    strategy_json = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)

    notes = Column(Text, nullable=True)
    planned_start_at = Column(DateTime, nullable=True)
    planned_end_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Denormalized KPIs (updated on line changes)
    total_lines = Column(Integer, nullable=False, default=0)
    counted_lines = Column(Integer, nullable=False, default=0)
    difference_lines = Column(Integer, nullable=False, default=0)
    coverage_percent = Column(Integer, nullable=False, default=0)

    stock_snapshot_id = Column(Integer, ForeignKey("inventory_snapshots.id", ondelete="SET NULL"), nullable=True, index=True)
    rw_stock_document_id = Column(Integer, ForeignKey("stock_documents.id", ondelete="SET NULL"), nullable=True)
    pw_stock_document_id = Column(Integer, ForeignKey("stock_documents.id", ondelete="SET NULL"), nullable=True)

    def touch_updated(self) -> None:
        self.updated_at = datetime.utcnow()
