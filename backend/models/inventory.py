"""
MODEL: Inventory

Per-tenant stock at a location in a warehouse.
Inventory belongsTo Tenant, Product, Location; Tenant hasMany Inventory.
"""

from sqlalchemy import Column, Integer, Float, ForeignKey, UniqueConstraint
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
    quantity = Column(Float, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("tenant_id", "product_id", "location_id", name="uq_inventory_tenant_product_location"),
    )

    tenant = relationship("Tenant", back_populates="inventory")
    product = relationship("Product", back_populates="inventory")
    warehouse = relationship("Warehouse", back_populates="inventory")
    location = relationship("Location", back_populates="inventory")
