"""Per-zone replenishment rules — min/max/target and preferred source zone."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text

from ..database import Base


class OperationalReplenishmentRule(Base):
    __tablename__ = "operational_replenishment_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=True, index=True)

    zone_type = Column(String(24), nullable=False, index=True)
    task_type = Column(String(32), nullable=False, default="REPLENISHMENT")
    min_qty = Column(Float, nullable=False, default=0.0)
    max_qty = Column(Float, nullable=True)
    target_qty = Column(Float, nullable=True)
    preferred_source_zone_type = Column(String(24), nullable=True)
    season_key = Column(String(32), nullable=True)
    time_window_json = Column(Text, nullable=True)
    priority = Column(Integer, nullable=False, default=50)
    is_active = Column(Boolean, nullable=False, default=True, index=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
