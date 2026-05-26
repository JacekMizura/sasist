"""Purchase orders (formal PO workflow) — separate from inbound `deliveries` until linked."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False, index=True)

    order_number = Column(String(64), nullable=False, index=True)
    status = Column(String(32), nullable=False, default="Draft", index=True)
    currency = Column(String(8), nullable=False, default="PLN")
    #: domestic_vat — Polish VAT on document; intra_eu_reverse_charge — supplier invoice 0% VAT, net=gross in foreign currency.
    tax_mode = Column(String(48), nullable=False, default="domestic_vat")
    invoice_date = Column(Date, nullable=True)

    subtotal = Column(Float, nullable=False, default=0.0)
    shipping_cost = Column(Float, nullable=False, default=0.0)
    total_value = Column(Float, nullable=False, default=0.0)

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    expected_date = Column(DateTime, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    confirmed_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)

    tenant = relationship("Tenant", back_populates="purchase_orders", foreign_keys=[tenant_id])
    supplier = relationship("Supplier", back_populates="purchase_orders", foreign_keys=[supplier_id])
    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
    items = relationship(
        "PurchaseOrderItem",
        back_populates="purchase_order",
        cascade="all, delete-orphan",
        order_by="PurchaseOrderItem.id",
    )
    linked_deliveries = relationship(
        "InboundDelivery",
        back_populates="purchase_order",
        foreign_keys="InboundDelivery.purchase_order_id",
    )


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    id = Column(Integer, primary_key=True)
    purchase_order_id = Column(Integer, ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)

    qty = Column(Float, nullable=False)
    received_qty = Column(Float, nullable=False, default=0.0)
    unit_price = Column(Float, nullable=True)
    line_total = Column(Float, nullable=False, default=0.0)
    notes = Column(Text, nullable=True)

    purchase_order = relationship("PurchaseOrder", back_populates="items", foreign_keys=[purchase_order_id])
    product = relationship("Product", back_populates="purchase_order_items", foreign_keys=[product_id])
