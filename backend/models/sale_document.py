"""Issued sale documents (FV/paragon) created from WMS packing — persisted row per issuance."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base


class SaleDocument(Base):
    """One row per automated (or manual) sales document issuance for an order."""

    __tablename__ = "sale_documents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    document_series_id = Column(String(36), ForeignKey("document_series.id"), nullable=False, index=True)
    document_number = Column(String(128), nullable=False)
    #: Panel metadata: INVOICE | PARAGON (paragon = receipt subtype)
    panel_document_type = Column(String(16), nullable=False)
    #: Always SALE for documents issued from sale series (see document_series.type).
    series_type = Column(String(24), nullable=False, default="SALE")

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)

    order = relationship("Order", foreign_keys=[order_id])
    document_series = relationship("DocumentSeries", foreign_keys=[document_series_id])
