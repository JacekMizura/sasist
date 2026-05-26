"""Customer (klient) — tenant-scoped; addresses and per-product discounts."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)

    first_name = Column(String(128), nullable=False, default="")
    last_name = Column(String(128), nullable=False, default="")
    phone = Column(String(64), nullable=True)
    email = Column(String(256), nullable=True)
    company_name = Column(String(256), nullable=True)
    nip = Column(String(32), nullable=True)
    country_code = Column(String(8), nullable=False, default="PL")

    default_document_type = Column(String(16), nullable=False, default="RECEIPT")
    preferred_shipping_method_id = Column(String(36), ForeignKey("shipping_methods.id", ondelete="SET NULL"), nullable=True)
    preferred_payment_method = Column(String(128), nullable=True)

    global_discount_percent = Column(Float, nullable=False, default=0.0)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)
    #: Archiwizacja — ukrycie z listy; zamówienia zachowują customer_id dla historii.
    deleted_at = Column(DateTime, nullable=True, index=True)

    tenant = relationship("Tenant", back_populates="customers", foreign_keys=[tenant_id])
    preferred_shipping_method = relationship("ShippingMethod", foreign_keys=[preferred_shipping_method_id])
    addresses = relationship(
        "CustomerAddress",
        back_populates="customer",
        cascade="all, delete-orphan",
        order_by="CustomerAddress.id",
    )
    product_discounts = relationship(
        "CustomerProductDiscount",
        back_populates="customer",
        cascade="all, delete-orphan",
    )
    orders = relationship("Order", back_populates="customer", foreign_keys="Order.customer_id")


class CustomerAddress(Base):
    __tablename__ = "customer_addresses"

    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)

    first_name = Column(String(128), nullable=False, default="")
    last_name = Column(String(128), nullable=False, default="")
    company_name = Column(String(256), nullable=True)
    street = Column(String(256), nullable=False, default="")
    house_number = Column(String(32), nullable=False, default="")
    apartment_number = Column(String(32), nullable=True)
    postal_code = Column(String(32), nullable=False, default="")
    city = Column(String(128), nullable=False, default="")
    country_code = Column(String(8), nullable=False, default="PL")
    is_default = Column(Boolean, nullable=False, default=False)

    customer = relationship("Customer", back_populates="addresses")


class CustomerProductDiscount(Base):
    __tablename__ = "customer_product_discounts"
    __table_args__ = (UniqueConstraint("customer_id", "product_id", name="uq_customer_product_discount"),)

    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    discount_percent = Column(Float, nullable=False, default=0.0)

    customer = relationship("Customer", back_populates="product_discounts")
    product = relationship("Product", foreign_keys=[product_id])
