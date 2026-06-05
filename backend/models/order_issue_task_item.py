"""Linie operacyjne zadania Braki — snapshot per order_item (nie zdarzenia fulfillment)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, Integer, String, UniqueConstraint

from ..database import Base


class OrderIssueTaskItem(Base):
    __tablename__ = "order_issue_task_items"
    __table_args__ = (
        UniqueConstraint("task_id", "order_item_id", name="uq_order_issue_task_items_task_line"),
        Index("ix_order_issue_task_items_task_status", "task_id", "status"),
        Index("ix_order_issue_task_items_product_wh", "product_id", "status"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(
        Integer,
        ForeignKey("order_issue_tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_item_id = Column(Integer, ForeignKey("order_items.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)

    missing_qty = Column(Float, nullable=False, default=0.0)
    recovered_qty = Column(Float, nullable=False, default=0.0)
    status = Column(String(24), nullable=False, default="OPEN", index=True)

    source_event_id = Column(String(128), nullable=True)
    source_picking_cart_id = Column(Integer, nullable=True)
    source_operator_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
