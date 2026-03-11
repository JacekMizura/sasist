"""
MODEL: OrderItem

Reprezentuje pozycję w zamówieniu.

Order 1 ---< OrderItem >--- 1 Product
"""

from sqlalchemy import Column, Integer, Float, ForeignKey, String
from sqlalchemy.orm import relationship
from ..database import Base


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True)

    # ================================
    # RELACJA DO ORDER
    # ================================

    order_id = Column(
        Integer,
        ForeignKey("orders.id"),
        nullable=False
    )

    order = relationship(
        "Order",
        back_populates="items"
    )

    # ================================
    # RELACJA DO PRODUCT
    # ================================

    product_id = Column(
        Integer,
        ForeignKey("products.id"),
        nullable=False
    )

    product = relationship("Product")
    picks = relationship("Pick", back_populates="order_item")

    # ================================
    # ILOŚĆ
    # ================================

    quantity = Column(Integer, nullable=False)

    # ================================
    # CENNIK (dla importu i analityki)
    # ================================

    unit_price = Column(Float, nullable=True)
    total_price = Column(Float, nullable=True)
    unit = Column(String, nullable=True)

    # ================================
    # CACHE OBJĘTOŚCI (opcjonalne)
    # ================================

    total_volume = Column(Float)
