"""Zgłoszenia braku przy zbieraniu WMS (audyt + powiązanie z zamówieniami)."""

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text

from ..database import Base


class WmsPickingShortageReport(Base):
    __tablename__ = "wms_picking_shortage_reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    source_status_id = Column(Integer, nullable=False, index=True)
    order_type = Column(String(16), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True)
    missing_qty = Column(Float, nullable=False)
    order_ids_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
