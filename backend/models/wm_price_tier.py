"""Volume price tiers for cartons and packaging materials (single table, no duplicate catalogs)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, text
from sqlalchemy.orm import relationship

from ..database import Base


class WmPriceTier(Base):
    __tablename__ = "wm_price_tiers"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)

    carton_id = Column(String(36), ForeignKey("cartons.id", ondelete="CASCADE"), nullable=True, index=True)
    packaging_material_id = Column(
        String(36), ForeignKey("packaging_materials.id", ondelete="CASCADE"), nullable=True, index=True
    )

    sort_index = Column(Integer, nullable=False, server_default=text("0"), default=0)
    qty_from = Column(Float, nullable=False, server_default=text("1"), default=1.0)
    package_qty = Column(Float, nullable=True)
    package_net_total = Column(Float, nullable=True)
    package_gross_total = Column(Float, nullable=True)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)

    carton = relationship("Carton", back_populates="price_tiers")
    packaging_material = relationship("PackagingMaterial", back_populates="price_tiers")
