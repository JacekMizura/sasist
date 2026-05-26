"""Supplier (dostawca) — tenant-scoped; inbound deliveries link via supplier_id."""

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text, Float, Numeric, text
from sqlalchemy.orm import relationship

from ..database import Base


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String, nullable=False)
    company_name = Column(String, nullable=True)
    tax_id = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    website = Column(String, nullable=True)
    country = Column(String, nullable=True)
    city = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)
    street = Column(Text, nullable=True)
    address = Column(Text, nullable=True)
    active = Column(Boolean, nullable=False, default=True)
    default_lead_time_days = Column(Integer, nullable=True)
    default_currency = Column(String(8), nullable=True)
    minimum_order_value = Column(Numeric(12, 2), nullable=True)
    #: Minimum order quantity (units) for purchasing / PO validation.
    minimum_order_qty = Column(Integer, nullable=True)
    #: Net order value from which supplier grants free shipping (same currency as default_currency when set).
    free_shipping_threshold = Column(Numeric(12, 2), nullable=True)
    #: When false, free-shipping threshold is ignored (supplier never unlocks free shipping by order value).
    offers_free_shipping = Column(Boolean, nullable=False, default=True)
    #: When false, supplier-level MOQ / min order value checks and catalog MOQ bumps are skipped for this supplier.
    requires_moq = Column(Boolean, nullable=False, default=True)
    notes = Column(Text, nullable=True)
    #: True when created from WMS with name only — admin completes profile later.
    is_incomplete = Column(Boolean, nullable=False, default=False, server_default=text("0"))

    tenant = relationship("Tenant", back_populates="suppliers", foreign_keys=[tenant_id])
    deliveries = relationship("InboundDelivery", back_populates="supplier", foreign_keys="InboundDelivery.supplier_id")
    purchase_orders = relationship(
        "PurchaseOrder",
        back_populates="supplier",
        foreign_keys="PurchaseOrder.supplier_id",
    )
    default_for_products = relationship(
        "Product",
        back_populates="default_supplier_row",
        foreign_keys="Product.default_supplier_id",
    )
    product_catalog_links = relationship(
        "SupplierProduct",
        back_populates="supplier",
        cascade="all, delete-orphan",
    )
