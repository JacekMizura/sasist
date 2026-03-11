"""
MODEL: Product

Produkt należy do konkretnego tenant.
Może być używany w wielu zamówieniach.
"""

from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text, Numeric, UniqueConstraint
from sqlalchemy.orm import relationship
from ..database import Base


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (UniqueConstraint("tenant_id", "ean", name="uq_product_tenant_ean"),)

    id = Column(Integer, primary_key=True)

    # =============================
    # RELACJE SAAS
    # =============================

    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)

    tenant = relationship("Tenant", back_populates="products")

    # =============================
    # DANE PRODUKTU
    # =============================

    name = Column(String)
    sku = Column(String, index=True)
    ean = Column(String, index=True)
    symbol = Column(String)  # legacy alias for sku
    barcode = Column(String(64), unique=True, nullable=True, index=True)  # PRD-000001 (Code128, scan)

    length = Column(Float)
    width = Column(Float)
    height = Column(Float)

    weight = Column(Float)

    volume = Column(Float)

    location = Column(String)

    purchase_price = Column(Numeric(10, 2), nullable=True)
    sale_price = Column(Numeric(10, 2), nullable=True)
    manufacturer = Column(String, nullable=True)
    unit = Column(String, nullable=True)

    image_url = Column(String)

    # Przypisania do lokalizacji magazynowych (JSON: [{"locationUUID": "...", "quantity": n}, ...])
    assigned_locations = Column(Text, nullable=True)

    # Szablon etykiety produktu (jeśli ustawiony, używany przy generowaniu etykiet)
    label_template_id = Column(
        Integer,
        ForeignKey("saved_label_templates.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    label_template = relationship("SavedLabelTemplate", foreign_keys=[label_template_id])

    # =============================
    # RELACJA DO POZYCJI ZAMÓWIENIA
    # =============================

    order_items = relationship(
        "OrderItem",
        back_populates="product"
    )

    inventory = relationship(
        "Inventory",
        back_populates="product",
        cascade="all, delete-orphan",
    )

    inventory_units = relationship(
        "InventoryUnit",
        back_populates="product",
        cascade="all, delete-orphan",
    )

    picks = relationship(
        "Pick",
        back_populates="product",
        cascade="all, delete-orphan",
    )

    inventory_movements = relationship(
        "InventoryMovement",
        back_populates="product",
        cascade="all, delete-orphan",
    )

    stock = relationship(
        "Stock",
        back_populates="product",
        cascade="all, delete-orphan",
    )
    stock_reservations = relationship(
        "StockReservation",
        back_populates="product",
        cascade="all, delete-orphan",
    )
    stock_movements = relationship(
        "StockMovement",
        back_populates="product",
        cascade="all, delete-orphan",
    )
    pick_tasks = relationship(
        "PickTask",
        back_populates="product",
        cascade="all, delete-orphan",
    )