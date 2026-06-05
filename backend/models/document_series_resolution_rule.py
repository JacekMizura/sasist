"""Series resolution rules — channel/mode/zone aware (no hardcoded FV/PA/WZ)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from ..database import Base


class DocumentSeriesResolutionRule(Base):
    __tablename__ = "document_series_resolution_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True)
    organization_id = Column(Integer, nullable=True)
    country_id = Column(Integer, nullable=True)
    document_type = Column(String(24), nullable=False, index=True)
    document_subtype = Column(String(32), nullable=True)
    order_channel = Column(String(24), nullable=True)
    fulfillment_mode = Column(String(24), nullable=True)
    fiscal_profile = Column(String(32), nullable=True)
    operational_zone = Column(String(24), nullable=True)
    series_id = Column(String(36), ForeignKey("document_series.id", ondelete="CASCADE"), nullable=False)
    priority = Column(Integer, nullable=False, default=100)
    is_active = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
