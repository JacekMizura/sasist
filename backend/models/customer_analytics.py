"""Materialized customer purchase analytics (not realtime order_items scans on read)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base


class CustomerSalesStats(Base):
    """One row per customer — rolled-up purchase KPIs."""

    __tablename__ = "customer_sales_stats"

    customer_id = Column(
        Integer,
        ForeignKey("customers.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)

    order_count = Column(Integer, nullable=False, default=0)
    total_net = Column(Float, nullable=False, default=0.0)
    total_vat = Column(Float, nullable=False, default=0.0)
    total_gross = Column(Float, nullable=False, default=0.0)
    total_products_qty = Column(Integer, nullable=False, default=0)
    avg_basket_gross = Column(Float, nullable=False, default=0.0)
    last_order_at = Column(DateTime, nullable=True)
    avg_days_between_orders = Column(Float, nullable=True)
    returns_corrections_count = Column(Integer, nullable=False, default=0)

    computed_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    customer = relationship("Customer", foreign_keys=[customer_id])


class CustomerProductStats(Base):
    """Per customer + product — top products and repeat purchase metrics."""

    __tablename__ = "customer_product_stats"
    __table_args__ = (UniqueConstraint("customer_id", "product_id", name="uq_customer_product_stats_pair"),)

    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)

    purchase_count = Column(Integer, nullable=False, default=0)
    total_quantity = Column(Integer, nullable=False, default=0)
    total_gross = Column(Float, nullable=False, default=0.0)
    last_purchased_at = Column(DateTime, nullable=True)

    computed_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    customer = relationship("Customer", foreign_keys=[customer_id])
    product = relationship("Product", foreign_keys=[product_id])
