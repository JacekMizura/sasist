"""Minimal sales offers — same warehouse product, different commercial/disposition pool (Etap 3A)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship

from ..database import Base


class ProductSalesOffer(Base):
    __tablename__ = "product_sales_offers"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    stock_disposition = Column(String(32), nullable=False, default="SALEABLE", index=True)
    name = Column(String(512), nullable=False)
    #: NULL = effective price falls back to ``Product.sale_price`` (no duplicated SSOT).
    sale_price_net = Column(Numeric(12, 2), nullable=True)
    is_default = Column(Boolean, nullable=False, default=False)
    active = Column(Boolean, nullable=False, default=True)
    #: Future outlet presentation (Etap 3B+) — nullable placeholders.
    outlet_damage_class = Column(String(8), nullable=True)
    outlet_damage_reasons_json = Column(Text, nullable=True)
    outlet_description = Column(Text, nullable=True)
    deleted_at = Column(DateTime, nullable=True, index=True)
    stock_pool_id = Column(
        Integer,
        ForeignKey("offer_stock_pools.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    product = relationship("Product", back_populates="sales_offers")
