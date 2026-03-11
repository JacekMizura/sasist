from sqlalchemy import Column, Integer, String, Float, ForeignKey, Enum
from sqlalchemy.orm import relationship
from ..database import Base
from .enums import CartType, CartStatus

class Cart(Base):
    __tablename__ = "carts"

    id = Column(Integer, primary_key=True)

    # ==========================================================
    # RELACJE SAAS (Multitenancy)
    # ==========================================================
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    
    # NOWE: Relacja do grupy
    group_id = Column(Integer, ForeignKey("cart_groups.id", ondelete="SET NULL"), nullable=True)

    tenant = relationship("Tenant")
    warehouse = relationship("Warehouse")
    group = relationship("CartGroup", back_populates="carts")

    # ==========================================================
    # DANE PODSTAWOWE WÓZKA
    # ==========================================================
    name = Column(String, nullable=False)
    barcode = Column(String(64), unique=True, nullable=True, index=True)  # e.g. CART-0001 (Code128)
    type = Column(Enum(CartType), nullable=False)
    image_url = Column(String, nullable=True)

    length = Column(Float)
    width = Column(Float)
    height = Column(Float)

    total_volume = Column(Float, default=0)
    used_volume = Column(Float, default=0)

    # Capacity limits: "volume" | "orders" | "mixed" (default volume)
    capacity_mode = Column(String(20), nullable=False, default="volume")
    max_orders = Column(Integer, nullable=True)  # used when capacity_mode is "orders" or "mixed"

    status = Column(Enum(CartStatus), default=CartStatus.AVAILABLE)

    # ==========================================================
    # RELACJE STRUKTURALNE
    # ==========================================================
    baskets = relationship(
        "CartBasket",
        back_populates="cart",
        cascade="all, delete"
    )

    # Zamówienia przypisane do wózka BULK (dla MULTI używane są basket.order_id)
    assigned_orders = relationship(
        "Order",
        back_populates="cart",
        foreign_keys="Order.cart_id",
    )

    pick_tasks = relationship(
        "PickTask",
        back_populates="cart",
        cascade="all, delete-orphan",
    )

    # ==========================================================
    # LOGIKA OBLICZENIOWA
    # ==========================================================
    def recalculate_total_volume(self):
        if self.type == CartType.MULTI or str(self.type).split('.')[-1].upper() == "MULTI":
            total = sum(
                ((b.inner_length or 0) * (b.inner_width or 0) * (b.inner_height or 0)) / 1000.0 
                for b in self.baskets
            )
            self.total_volume = round(total, 2)
        else:
            total = ((self.length or 0) * (self.width or 0) * (self.height or 0)) / 1000.0
            self.total_volume = round(total, 2)
        
        return self.total_volume