from sqlalchemy import Column, Integer, String, Float, ForeignKey, Enum, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base
from .enums import CartType, CartStatus

class Cart(Base):
    __tablename__ = "carts"
    __table_args__ = (
        UniqueConstraint("tenant_id", "warehouse_id", "code", name="uq_cart_tenant_wh_code"),
    )

    id = Column(Integer, primary_key=True)

    # ==========================================================
    # RELACJE SAAS (Multitenancy)
    # ==========================================================
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    
    # NOWE: Relacja do grupy
    group_id = Column(Integer, ForeignKey("cart_groups.id", ondelete="SET NULL"), nullable=True)

    tenant = relationship("Tenant", back_populates="carts")
    warehouse = relationship("Warehouse", back_populates="carts")
    group = relationship("CartGroup", back_populates="carts")

    # ==========================================================
    # DANE PODSTAWOWE WÓZKA
    # ==========================================================
    name = Column(String, nullable=False)
    #: Skanowany identyfikator wózka (np. CART-0001); unikat w obrębie tenant+magazyn.
    code = Column(String(64), nullable=False, index=True)
    #: Zgodne z ``code`` (etykiety / skan); unikat w obrębie tenant+magazyn jak ``code``.
    barcode = Column(String(64), nullable=True, index=True)
    #: Wewnętrzny kod skanowania (ESP:shpcart:id lub ESP:brck:id); unikat globalnie — indeks w schema_upgrade.
    scan_code = Column(String(80), nullable=True, index=True)
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

    # String — unika natywnego PG ENUM przy migracji AVAILABLE/ASSIGNED/PICKING/…
    status = Column(String(32), nullable=False, default=CartStatus.AVAILABLE.value, index=True)

    #: Operator przypisany do aktywnej sesji zbierania/pakowania (SSOT lifecycle).
    assigned_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)
    #: Otwarta ``wms_operation_sessions.id`` (picking_active) — bez FK (cykl carts ↔ sessions).
    current_session_id = Column(Integer, nullable=True, index=True)

    # ==========================================================
    # RELACJE STRUKTURALNE
    # ==========================================================
    baskets = relationship(
        "CartBasket",
        back_populates="cart",
        cascade="all, delete"
    )

    legacy_baskets = relationship(
        "Basket",
        back_populates="cart",
        cascade="all, delete-orphan",
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

    wms_picks = relationship(
        "Pick",
        back_populates="cart",
        foreign_keys="Pick.cart_id",
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