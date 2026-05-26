"""
MODEL: Inventory

Per-tenant stock at a location in a warehouse.
Inventory belongsTo Tenant, Product, Location; Tenant hasMany Inventory.
"""

from datetime import date

from sqlalchemy import Column, Date, Integer, Float, ForeignKey, String, text
from sqlalchemy.orm import relationship
from ..database import Base
from .base import BaseModelMixin


class Inventory(Base, BaseModelMixin):
    __tablename__ = "inventory"

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
    carrier_id = Column(
        Integer,
        ForeignKey("warehouse_carriers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    location_uuid = Column(String(64), nullable=True, index=True)
    quantity = Column(Float, nullable=False, default=0)
    batch_number = Column(String(128), nullable=False, default="")
    expiry_date = Column(Date, nullable=False, default=date(9999, 12, 31))
    stock_disposition = Column(
        String(32),
        nullable=False,
        default="SALEABLE",
        server_default=text("'SALEABLE'"),
        index=True,
    )

    tenant = relationship("Tenant", back_populates="inventory")
    product = relationship("Product", back_populates="inventory")
    warehouse = relationship("Warehouse", back_populates="inventory")
    location = relationship("Location", back_populates="inventory")
    carrier = relationship("WarehouseCarrier", foreign_keys=[carrier_id])
