"""
MODEL: PickTask

Single pick task: order line + location + quantity. status: waiting | picking | picked.
Optional cart_id for assignment to a cart.
"""

from sqlalchemy import Column, Integer, Float, ForeignKey, String
from sqlalchemy.orm import relationship
from ..database import Base
from .base import BaseModelMixin


class PickTask(Base, BaseModelMixin):
    __tablename__ = "pick_tasks"

    tenant_id = Column(
        Integer,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_id = Column(
        Integer,
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
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
    quantity = Column(Float, nullable=False)
    cart_id = Column(
        Integer,
        ForeignKey("carts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status = Column(String(20), nullable=False, default="waiting")  # waiting | picking | picked

    tenant = relationship("Tenant", back_populates="pick_tasks")
    order = relationship("Order", back_populates="pick_tasks")
    product = relationship("Product", back_populates="pick_tasks")
    location = relationship("Location", back_populates="pick_tasks")
    cart = relationship("Cart", back_populates="pick_tasks")
    pick_wave_tasks = relationship(
        "PickWaveTask",
        back_populates="pick_task",
        cascade="all, delete-orphan",
    )
