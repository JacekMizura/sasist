"""
MODEL: StockMovement

Inventory history. type: receive | move | pick | adjust | return.
"""

from sqlalchemy import Column, Integer, Float, ForeignKey, String
from sqlalchemy.orm import relationship
from ..database import Base
from .base import BaseModelMixin


class StockMovement(Base, BaseModelMixin):
    __tablename__ = "stock_movements"

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
    type = Column(String(20), nullable=False)  # receive | move | pick | adjust | return

    tenant = relationship("Tenant", back_populates="stock_movements")
    product = relationship("Product", back_populates="stock_movements")
    from_location = relationship("Location", foreign_keys=[from_location_id])
    to_location = relationship("Location", foreign_keys=[to_location_id])
