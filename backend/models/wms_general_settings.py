"""Warehouse-level general WMS settings (shared across operator modes)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, UniqueConstraint

from ..database import Base

# Allowed px sizes for operator typography (SSOT).
WMS_FONT_SIZE_PX = (12, 14, 16, 18, 20)
WMS_FONT_SIZE_DEFAULT_PX = 16


class WmsGeneralSettings(Base):
    __tablename__ = "wms_general_settings"
    __table_args__ = (UniqueConstraint("tenant_id", "warehouse_id", name="uq_wms_general_tenant_wh"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)

    #: Base text size in new WMS mode views (px).
    font_size_base_px = Column(Integer, nullable=False, default=WMS_FONT_SIZE_DEFAULT_PX)
    #: Location label size (e.g. A-01-02) in new mode views (px).
    font_size_location_px = Column(Integer, nullable=False, default=WMS_FONT_SIZE_DEFAULT_PX)
    #: Quantity label size (e.g. 5 szt., 12/20) in new mode views (px).
    font_size_quantity_px = Column(Integer, nullable=False, default=WMS_FONT_SIZE_DEFAULT_PX)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)
