"""
WMS Settings per tenant + warehouse.

Controls which return workflow operator should follow.
"""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from ..database import Base


class WmsSettings(Base):
    __tablename__ = "wms_settings"
    __table_args__ = (UniqueConstraint("tenant_id", "warehouse_id", name="uq_wms_settings_tenant_warehouse"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)

    # simple | two_step | advanced
    returns_mode = Column(String(24), nullable=False, default="simple")

    require_photos = Column(Boolean, nullable=False, default=False)
    require_condition = Column(Boolean, nullable=False, default=False)
    enable_refund = Column(Boolean, nullable=False, default=False)

    z_pz_print_label_on_close = Column(Boolean, nullable=False, default=False)
    z_pz_label_template_id = Column(Integer, nullable=True)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow)

