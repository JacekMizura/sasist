"""WMS replenishment task queue (pick face refill from buffer/reserve)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base


class ReplenishmentTask(Base):
    __tablename__ = "replenishment_tasks"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)

    source_location_id = Column(Integer, ForeignKey("locations.id", ondelete="CASCADE"), nullable=False, index=True)
    target_location_id = Column(Integer, ForeignKey("locations.id", ondelete="CASCADE"), nullable=False, index=True)

    quantity = Column(Float, nullable=False)
    """Łączna ilość do uzupełnienia pick face: min_pick − aktualny stan PICK (nie capowana do jednej rezerwy)."""

    sources_json = Column(Text, nullable=True)
    """JSON: [{\"location_id\", \"quantity_planned\", \"quantity_done\"}, ...] — łańcuch lokalizacji BUFFER."""

    priority_score = Column(Float, nullable=False, default=0.0)
    priority_band = Column(String(16), nullable=False, default="LOW")  # HIGH | MEDIUM | LOW
    status = Column(String(20), nullable=False, default="OPEN", index=True)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    assigned_admin_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)

    product = relationship("Product", lazy="joined")
    source_location = relationship("Location", foreign_keys=[source_location_id], lazy="joined")
    target_location = relationship("Location", foreign_keys=[target_location_id], lazy="joined")
