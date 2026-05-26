"""Warehouse-facing operational notes on orders (distinct from customer-facing comments)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base


class OrderOperationalNote(Base):
    __tablename__ = "order_operational_notes"

    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    author_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)
    content = Column(Text, nullable=False)

    show_in_picking = Column(Boolean, nullable=False, default=False)
    show_in_packing = Column(Boolean, nullable=False, default=False)
    show_in_returns = Column(Boolean, nullable=False, default=False)
    show_in_complaints = Column(Boolean, nullable=False, default=False)

    priority = Column(Integer, nullable=True)
    color_tag = Column(String(32), nullable=True)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)

    order = relationship("Order", back_populates="operational_notes")
