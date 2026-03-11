"""
MODEL: Stock

Enterprise physical inventory. One row per (tenant, product, warehouse, location).
Available = quantity - SUM(stock_reservations.quantity WHERE status='reserved').
"""

from sqlalchemy import Column, Integer, Float, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base
from .base import BaseModelMixin


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
    quantity = Column(Float, nullable=False, default=0)

    tenant = relationship("Tenant", back_populates="stock")
    product = relationship("Product", back_populates="stock")
    warehouse = relationship("Warehouse", back_populates="stock")
    location = relationship("Location", back_populates="stock")
