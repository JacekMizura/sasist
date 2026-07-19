"""Zdarzenia panelowe powiązane z zamówieniem (m.in. upload dokumentów)."""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base


class OrderActivityLog(Base):
    __tablename__ = "order_activity_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)

    event_type = Column(String(64), nullable=False, index=True)
    message = Column(Text, nullable=False)
    #: Operator / System actor — not parsed from ``message``.
    operator_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)

    order = relationship("Order", back_populates="order_activity_logs")
