"""Many-to-many supplier ↔ product catalog offer (price, lead time, MOQ)."""

from sqlalchemy import Column, ForeignKey, Integer, Numeric, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base


class SupplierProduct(Base):
    __tablename__ = "supplier_products"
    __table_args__ = (UniqueConstraint("supplier_id", "product_id", name="uq_supplier_products_supplier_product"),)

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)

    purchase_price = Column(Numeric(12, 2), nullable=True)
    lead_time_days = Column(Integer, nullable=True)
    min_order_qty = Column(Numeric(12, 3), nullable=True)
    #: Wielokrotność zamówienia (np. paczka).
    pack_qty = Column(Numeric(12, 3), nullable=True)
    #: Wielokrotność kartonu (nadrzędna względem paczki przy zaokrąglaniu).
    carton_qty = Column(Numeric(12, 3), nullable=True)
    #: JSON array: [{"qty_from": 1, "unit_net": 10.0}, {"qty_from": 100, "unit_net": 9.5}, ...] — optional quantity tiers.
    purchase_price_tiers_json = Column(Text, nullable=True)

    supplier = relationship("Supplier", back_populates="product_catalog_links")
    product = relationship("Product", back_populates="supplier_catalog_links")
