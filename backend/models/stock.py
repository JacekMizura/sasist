"""
MODEL: Stock

Enterprise physical inventory. One row per (tenant, product, warehouse, location).
Available = quantity - SUM(stock_reservations.quantity WHERE status='reserved').
"""

import logging

from sqlalchemy import event
from sqlalchemy import Column, Integer, Float, ForeignKey, String
from sqlalchemy.orm import relationship
from ..database import Base
from .base import BaseModelMixin

logger = logging.getLogger(__name__)
_stock_deprecated_warned = False


def _warn_stock_deprecated_once() -> None:
    global _stock_deprecated_warned
    if _stock_deprecated_warned:
        return
    _stock_deprecated_warned = True
    logger.warning("Stock table is deprecated - using inventory instead")


class Stock(Base, BaseModelMixin):
    __tablename__ = "stock"

    tenant_id = Column(
        Integer,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id = Column(
        Integer,
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    warehouse_id = Column(
        Integer,
        ForeignKey("warehouses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    location_id = Column(
        Integer,
        ForeignKey("locations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    location_uuid = Column(String(64), nullable=True, index=True)
    quantity = Column(Float, nullable=False, default=0)

    tenant = relationship("Tenant", back_populates="stock")
    product = relationship("Product", back_populates="stock")
    warehouse = relationship("Warehouse", back_populates="stock")
    location = relationship("Location", back_populates="stock")


@event.listens_for(Stock, "load")
def _on_stock_load(_target, _context):
    _warn_stock_deprecated_once()


@event.listens_for(Stock, "before_insert")
@event.listens_for(Stock, "before_update")
def _on_stock_write(_mapper, _connection, _target):
    _warn_stock_deprecated_once()
