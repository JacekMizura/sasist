"""Załączniki / dokumenty powiązane z zamówieniem (upload z panelu)."""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base


class OrderDocument(Base):
    __tablename__ = "order_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)

    #: Wartość ``OrderDocumentType`` (np. FAKTURA, ZALACZNIK).
    document_type = Column(String(32), nullable=False, index=True)
    original_filename = Column(String(512), nullable=False)
    stored_filename = Column(String(512), nullable=False)
    file_url = Column(String(512), nullable=False)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)

    order = relationship("Order", back_populates="order_documents")
