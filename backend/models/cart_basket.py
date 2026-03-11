"""
MODEL: CartBasket

Koszyk w wózku MULTI.
Może zawierać jedno zamówienie.
"""

from sqlalchemy import Column, Integer, Float, ForeignKey, String
from sqlalchemy.orm import relationship
from ..database import Base


class CartBasket(Base):
    __tablename__ = "cart_baskets"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=True)
    barcode = Column(String(64), unique=True, nullable=True, index=True)  # e.g. CART-0001-B01

    # =============================
    # RELACJA DO WÓZKA
    # =============================

    cart_id = Column(Integer, ForeignKey("carts.id"), nullable=False)
    cart = relationship("Cart", back_populates="baskets")

    # =============================
    # POZYCJA W SIATCE
    # =============================

    row = Column(Integer, nullable=False)
    column = Column(Integer, nullable=False)

    # =============================
    # WYMIARY
    # =============================

    inner_length = Column(Float, nullable=False)
    inner_width = Column(Float, nullable=False)
    inner_height = Column(Float, nullable=False)

    usable_volume = Column(Float, nullable=False)
    used_volume = Column(Float, default=0)  # dm³ – zapełnienie po przypisaniu zamówienia

    max_weight = Column(Float)

    # =============================
    # TRWAŁE PRZYPISANIE ZAMÓWIENIA
    # =============================

    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)

    # The order placed IN this basket (one basket, one order via order_id)
    order = relationship(
        "Order",
        back_populates="baskets",
        foreign_keys=[order_id],
    )
    # Orders that reference this basket via Order.basket_id (one basket, many orders)
    orders = relationship(
        "Order",
        back_populates="basket",
        foreign_keys="Order.basket_id",
    )

    