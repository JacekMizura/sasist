"""
MODEL: InventoryMovement

History of inventory moves (receive | pick | move | adjust).
"""

from sqlalchemy import Column, Integer, Float, ForeignKey, String
from sqlalchemy.orm import relationship
from ..database import Base
from .base import BaseModelMixin


class InventoryMovement(Base, BaseModelMixin):
    __tablename__ = "inventory_movements"

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
    from_location_id = Column(
        Integer,
        ForeignKey("locations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    to_location_id = Column(
        Integer,
        ForeignKey("locations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    quantity = Column(Float, nullable=False)
    type = Column(String(20), nullable=False)  # receive | pick | move | adjust

    tenant = relationship("Tenant", back_populates="inventory_movements")
    product = relationship("Product", back_populates="inventory_movements")
    from_location = relationship("Location", foreign_keys=[from_location_id])
    to_location = relationship("Location", foreign_keys=[to_location_id])
