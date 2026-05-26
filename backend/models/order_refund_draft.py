"""
Draft refund lines for OMS orders (e.g. WMS shortage removals). Not processed until a future settlement flow.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base


class OrderRefundDraft(Base):
    __tablename__ = "order_refund_drafts"
    __table_args__ = (UniqueConstraint("order_id", name="uq_order_refund_drafts_order_id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    status = Column(String(16), nullable=False, default="DRAFT")
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)

    lines = relationship("OrderRefundDraftLine", back_populates="draft", cascade="all, delete-orphan")


class OrderRefundDraftLine(Base):
    __tablename__ = "order_refund_draft_lines"

    id = Column(Integer, primary_key=True, autoincrement=True)
    draft_id = Column(Integer, ForeignKey("order_refund_drafts.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    order_item_id = Column(Integer, ForeignKey("order_items.id", ondelete="SET NULL"), nullable=True, index=True)
    quantity = Column(Float, nullable=False)
    amount = Column(Float, nullable=True)
    reason = Column(String(32), nullable=False)
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)

    draft = relationship("OrderRefundDraft", back_populates="lines")
