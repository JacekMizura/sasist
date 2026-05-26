from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base


class OrderNote(Base):
    __tablename__ = "order_notes"

    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    type = Column(String(32), nullable=False, default="internal", index=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)

    order = relationship("Order", back_populates="order_notes")
