"""
MODEL: InventoryUnit

Replaces Inventory. Per-tenant stock at a location with reservations.
available_quantity = quantity - reserved_quantity.
Reservation: increase reserved_quantity. Pick: decrease quantity and reserved_quantity.
"""

from sqlalchemy import Column, Integer, Float, ForeignKey, String, Date
from sqlalchemy.orm import relationship
from ..database import Base
from .base import BaseModelMixin


class InventoryUnit(Base, BaseModelMixin):
    __tablename__ = "inventory_units"

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
    reserved_quantity = Column(Float, nullable=False, default=0)
    batch = Column(String(64), nullable=True)
    serial_number = Column(String(64), nullable=True)
    expiration_date = Column(Date, nullable=True)

    tenant = relationship("Tenant", back_populates="inventory_units")
    product = relationship("Product", back_populates="inventory_units")
    warehouse = relationship("Warehouse", back_populates="inventory_units")
    location = relationship("Location", back_populates="inventory_units")
    picks = relationship(
        "Pick",
        back_populates="inventory_unit",
        cascade="all, delete-orphan",
    )

    @property
    def available_quantity(self) -> float:
        return max(0.0, float(self.quantity) - float(self.reserved_quantity))
