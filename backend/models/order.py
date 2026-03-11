"""
MODEL: Order

Nagłówek zamówienia.
Prawdziwa objętość liczona jest z OrderItem.
"""

from datetime import datetime

from sqlalchemy import Column, Integer, String, ForeignKey, Float, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from ..database import Base


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (UniqueConstraint("tenant_id", "warehouse_id", "number", name="uq_order_tenant_warehouse_number"),)

    id = Column(Integer, primary_key=True)

    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)

    number = Column(String)

    # Data przyjęcia zamówienia do systemu (domyślnie przy tworzeniu)
    order_date = Column(DateTime, nullable=True, default=datetime.utcnow)

    value = Column(Float, nullable=True)
    created_at = Column(DateTime, nullable=True)
    source = Column(String)
    shipping_method = Column(String)
    currency = Column(String)
    city = Column(String)
    country = Column(String)

    status = Column(String, default="NEW")
    barcode = Column(String(64), unique=True, nullable=True, index=True)  # ORD-000123 (Code128, scan)

    # Przypisanie do wózka (BULK: cart_id; MULTI: cart_id + basket_id)
    cart_id = Column(Integer, ForeignKey("carts.id", ondelete="SET NULL"), nullable=True)
    basket_id = Column(Integer, ForeignKey("cart_baskets.id", ondelete="SET NULL"), nullable=True)
    total_volume_dm3 = Column(Float, nullable=True)  # objętość zamówienia (dm³) – ustawiana przy przypisaniu

    # Fala kompletacji (wave picking). NULL = gotowe do przypisania do fali.
    wave_id = Column(Integer, ForeignKey("waves.id", ondelete="SET NULL"), nullable=True)

    # ================================
    # RELACJE
    # ================================

    tenant = relationship("Tenant")
    wave = relationship("Wave", back_populates="orders", foreign_keys=[wave_id])
    warehouse = relationship("Warehouse")
    cart = relationship("Cart", back_populates="assigned_orders", foreign_keys=[cart_id])
    # One-to-Many: one basket, many orders (Order.basket_id -> CartBasket.id)
    basket = relationship("CartBasket", back_populates="orders", foreign_keys=[basket_id])

    items = relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete"
    )

    picks = relationship(
        "Pick",
        back_populates="order",
        cascade="all, delete-orphan",
    )
    stock_reservations = relationship(
        "StockReservation",
        back_populates="order",
        cascade="all, delete-orphan",
    )
    pick_tasks = relationship(
        "PickTask",
        back_populates="order",
        cascade="all, delete-orphan",
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
