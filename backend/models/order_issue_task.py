"""WMS: zadania operacyjne przy brakach przy zbieraniu (Order Issues)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from ..database import Base


class OrderIssueTask(Base):
    __tablename__ = "order_issue_tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)

    #: Ostatnio zapisany typ (np. MIXED); UI może policzyć `recommended_action` na żywo.
    type = Column(String(32), nullable=False, index=True)
    status = Column(String(16), nullable=False, default="OPEN", index=True)

    missing_items = Column(Text, nullable=False, default="[]")
    picked_items = Column(Text, nullable=False, default="[]")
    baseline_order_lines_json = Column(Text, nullable=False, default="{}")

    logs_json = Column(Text, nullable=False, default="[]")

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
