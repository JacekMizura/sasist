"""Sales packaging specification attached to a sellable Product (PPWR stage 3A).

Not inventory. Not Carton. Not PackagingMaterial. Not Product.carton_* logistics.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, text
from sqlalchemy.orm import relationship

from ..database import Base


class ProductSalesPackaging(Base):
    __tablename__ = "product_sales_packaging"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    product_id = Column(
        Integer,
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(256), nullable=False)
    #: PRIMARY | SECONDARY
    level = Column(String(16), nullable=False, server_default=text("'PRIMARY'"), default="PRIMARY")
    ppwr_format = Column(String(64), nullable=True)
    material_category = Column(String(128), nullable=True)
    mass_g = Column(Float, nullable=True)
    recyclable_pct = Column(Float, nullable=True)
    recycled_content_pct = Column(Float, nullable=True)
    is_reusable = Column(Boolean, nullable=True)
    #: NOT_ASSESSED | INCOMPLETE | READY
    ppwr_status = Column(
        String(32),
        nullable=False,
        server_default=text("'NOT_ASSESSED'"),
        default="NOT_ASSESSED",
    )
    is_active = Column(Boolean, nullable=False, server_default=text("true"), default=True)
    sort_order = Column(Integer, nullable=False, server_default=text("0"), default=0)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)

    product = relationship("Product", foreign_keys=[product_id])
