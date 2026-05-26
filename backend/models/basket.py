"""
BASKET MODEL (ORM)

Reprezentuje pojedynczy koszyk na wózku.
"""

from sqlalchemy import Column, Integer, Float, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base


class Basket(Base):
    __tablename__ = "baskets"

    id = Column(Integer, primary_key=True)

    row = Column(Integer)
    column = Column(Integer)

    length = Column(Float)
    width = Column(Float)
    height = Column(Float)

    # Obliczona objętość koszyka
    volume = Column(Float)

    # FK do Cart
    cart_id = Column(Integer, ForeignKey("carts.id"))

    cart = relationship("Cart", back_populates="legacy_baskets")
