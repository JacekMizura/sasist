"""Offer stock pools — which warehouses contribute to offer availability."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base


class OfferStockPool(Base):
    __tablename__ = "offer_stock_pools"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_offer_stock_pool_tenant_name"),)

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(256), nullable=False)
    is_default = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    warehouse_links = relationship(
        "OfferStockPoolWarehouse",
        back_populates="pool",
        cascade="all, delete-orphan",
    )


class OfferStockPoolWarehouse(Base):
    __tablename__ = "offer_stock_pool_warehouses"
    __table_args__ = (
        UniqueConstraint("pool_id", "warehouse_id", name="uq_offer_stock_pool_wh"),
    )

    pool_id = Column(Integer, ForeignKey("offer_stock_pools.id", ondelete="CASCADE"), primary_key=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), primary_key=True)

    pool = relationship("OfferStockPool", back_populates="warehouse_links")
