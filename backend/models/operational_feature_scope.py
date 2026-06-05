"""Per-tenant / per-warehouse operational feature overrides (nullable = inherit global)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, UniqueConstraint

from ..database import Base


class OperationalFeatureScope(Base):
    """
    Scoped rollout overrides.

    warehouse_id 0 → tenant-wide default for that tenant.
    warehouse_id > 0 → warehouse-specific override (wins over tenant row).
    Boolean NULL on a flag → inherit from broader scope / global env.
    """

    __tablename__ = "operational_feature_scopes"
    __table_args__ = (
        UniqueConstraint("tenant_id", "warehouse_id", name="uq_operational_feature_scopes_tenant_wh"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, nullable=False, default=0, index=True)

    operational_sales = Column(Boolean, nullable=True)
    immediate_wms_exclusion = Column(Boolean, nullable=True)
    operational_sales_sessions = Column(Boolean, nullable=True)
    operational_runtime = Column(Boolean, nullable=True)
    replenishment_engine = Column(Boolean, nullable=True)

    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
