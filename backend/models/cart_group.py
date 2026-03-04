from sqlalchemy import Column, Integer, String, Enum
from sqlalchemy.orm import relationship
from ..database import Base
from .enums import CartType

class CartGroup(Base):
    __tablename__ = "cart_groups"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, nullable=False)
    cart_type = Column(Enum(CartType), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)

    # Relacja do wózków - jedna grupa ma wiele wózków
    carts = relationship("Cart", back_populates="group")