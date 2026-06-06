"""Per-tenant / per-warehouse direct sales business configuration."""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Text, UniqueConstraint

from ..database import Base

# warehouse_id=0 → tenant-wide defaults; warehouse_id>0 → warehouse override row
TENANT_DEFAULT_WAREHOUSE_ID = 0


class DirectSalesSettings(Base):
    __tablename__ = "direct_sales_settings"
    __table_args__ = (
        UniqueConstraint("tenant_id", "warehouse_id", name="uq_direct_sales_settings_tenant_wh"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, nullable=False, index=True, default=TENANT_DEFAULT_WAREHOUSE_ID)
    settings_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)
