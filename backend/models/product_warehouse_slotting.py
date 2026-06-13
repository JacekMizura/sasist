"""Per-warehouse product slotting plan (assigned locations). SSOT for multi-WH slotting."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base


class ProductWarehouseSlotting(Base):
    __tablename__ = "product_warehouse_slotting"
    __table_args__ = (
        UniqueConstraint(
            "product_id",
            "warehouse_id",
            "location_uuid",
            name="uq_product_wh_slotting_product_wh_uuid",
        ),
    )

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    location_uuid = Column(String(64), nullable=False, index=True)
    quantity = Column(Float, nullable=False, default=0)
    storage_type = Column(String(32), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    product = relationship("Product", back_populates="warehouse_slotting")
    warehouse = relationship("Warehouse")
