"""
MODEL: Order

Nagłówek zamówienia.
Prawdziwa objętość liczona jest z OrderItem.
"""

from sqlalchemy import Column, Integer, String, ForeignKey, Float
from sqlalchemy.orm import relationship
from ..database import Base


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True)

    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)

    number = Column(String)

    value = Column(Float)
    source = Column(String)
    shipping_method = Column(String)
    currency = Column(String)
    city = Column(String)
    country = Column(String)

    status = Column(String, default="NEW")

    # Przypisanie do wózka (BULK: cart_id; MULTI: cart_id + basket_id)
    cart_id = Column(Integer, ForeignKey("carts.id", ondelete="SET NULL"), nullable=True)
    basket_id = Column(Integer, ForeignKey("cart_baskets.id", ondelete="SET NULL"), nullable=True)
    total_volume_dm3 = Column(Float, nullable=True)  # objętość zamówienia (dm³) – ustawiana przy przypisaniu

    # ================================
    # RELACJE
    # ================================
    
    tenant = relationship("Tenant")
    warehouse = relationship("Warehouse")
    cart = relationship("Cart", back_populates="assigned_orders", foreign_keys=[cart_id])
    # One-to-Many: one basket, many orders (Order.basket_id -> CartBasket.id)
    basket = relationship("CartBasket", back_populates="orders", foreign_keys=[basket_id])

    items = relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete"
    )

    # Baskets that contain this order (CartBasket.order_id -> Order.id)
    baskets = relationship(
        "CartBasket",
        back_populates="order",
        foreign_keys="CartBasket.order_id",
    )

    # Strefy gabarytowe – jedno zamówienie może obejmować wiele stref
    picking_zones = relationship(
        "PickingZone",
        secondary="order_zone",
        back_populates="orders",
    )
