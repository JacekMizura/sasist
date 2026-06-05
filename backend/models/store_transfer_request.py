"""Multi-store foundation — cross-store transfer requests (phase 4 stub)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String

from ..database import Base

TRANSFER_REQUESTED = "REQUESTED"
TRANSFER_APPROVED = "APPROVED"
TRANSFER_IN_TRANSIT = "IN_TRANSIT"
TRANSFER_COMPLETED = "COMPLETED"
TRANSFER_CANCELLED = "CANCELLED"


class StoreTransferRequest(Base):
    __tablename__ = "store_transfer_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    from_warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False)
    to_warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity = Column(Float, nullable=False, default=0.0)
    status = Column(String(24), nullable=False, default=TRANSFER_REQUESTED, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
