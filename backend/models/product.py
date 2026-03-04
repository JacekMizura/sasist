"""
MODEL: Product

Produkt należy do konkretnego tenant.
Może być używany w wielu zamówieniach.
"""

from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text
from sqlalchemy.orm import relationship
from ..database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True)

    # =============================
    # RELACJE SAAS
    # =============================

    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)

    tenant = relationship("Tenant")

    # =============================
    # DANE PRODUKTU
    # =============================

    name = Column(String)
    ean = Column(String, index=True)
    symbol = Column(String)

    length = Column(Float)
    width = Column(Float)
    height = Column(Float)

    weight = Column(Float)

    volume = Column(Float)

    location = Column(String)

    purchase_price = Column(Float)

    image_url = Column(String)

    # Przypisania do lokalizacji magazynowych (JSON: [{"locationUUID": "...", "quantity": n}, ...])
    assigned_locations = Column(Text, nullable=True)

    # =============================
    # RELACJA DO POZYCJI ZAMÓWIENIA
    # =============================

    order_items = relationship(
        "OrderItem",
        back_populates="product"
    )