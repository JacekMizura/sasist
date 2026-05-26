"""
MODEL: Pick

Pick event: records product picking from a warehouse location.

When fulfilling an order:
1. Determine location of the product from inventory.
2. Create a Pick record for the selected location.
3. Reduce inventory quantity.
4. Store pick timestamp (picked_at).

Analytics (Hot locations, Walking simulation, Slotting validation) use the picks
table instead of order_items → inventory → location.
"""

from datetime import date

from sqlalchemy import Column, Date, Integer, Float, ForeignKey, String, DateTime
from sqlalchemy.orm import relationship

from ..database import Base
from .base import BaseModelMixin


class Pick(Base, BaseModelMixin):
    __tablename__ = "picks"

    tenant_id = Column(
        Integer,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    warehouse_id = Column(
        Integer,
        ForeignKey("warehouses.id", ondelete="CASCADE"),
        nullable=True,  # backfilled from order.warehouse_id for existing rows
        index=True,
    )
    order_id = Column(
        Integer,
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_item_id = Column(
        Integer,
        ForeignKey("order_items.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    product_id = Column(
        Integer,
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    location_id = Column(
        Integer,
        ForeignKey("locations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    cart_id = Column(
        Integer,
        ForeignKey("carts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    quantity = Column(Float, nullable=False)
    batch_number = Column(String(128), nullable=False, default="")
    expiry_date = Column(Date, nullable=False, default=date(9999, 12, 31))
    picked_at = Column(DateTime, nullable=True)  # when the pick was performed
    picker_id = Column(Integer, nullable=True, index=True)  # optional user/worker id

    # Optional link to inventory unit. Nullable to support simulated picks (location + quantity only).
    inventory_unit_id = Column(
        Integer,
        ForeignKey("inventory_units.id"),
        nullable=True,
        index=True,
    )
    status = Column(String(20), nullable=False, default="waiting")  # waiting | picking | done

    tenant = relationship("Tenant", back_populates="picks")
    warehouse = relationship("Warehouse", back_populates="picks")
    order = relationship("Order", back_populates="picks")
    order_item = relationship("OrderItem", back_populates="picks")
    product = relationship("Product", back_populates="picks")
    location = relationship("Location", back_populates="picks")
    cart = relationship("Cart", back_populates="wms_picks", foreign_keys=[cart_id])
    inventory_unit = relationship("InventoryUnit", back_populates="picks")
    pick_wave_items = relationship(
        "PickWaveItem",
        back_populates="pick",
        cascade="all, delete-orphan",
    )
