"""Operator runtime context — where operator works and active workflow SSOT."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from ..database import Base


class OperatorRuntimeContext(Base):
    __tablename__ = "operator_runtime_context"
    __table_args__ = (
        UniqueConstraint("tenant_id", "warehouse_id", "operator_user_id", name="uq_operator_runtime_ctx"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    operator_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False, index=True)

    context_type = Column(String(32), nullable=False, default="PICKING")
    cart_id = Column(Integer, ForeignKey("carts.id", ondelete="SET NULL"), nullable=True)
    zone_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    active_task_id = Column(Integer, ForeignKey("wms_operational_tasks.id", ondelete="SET NULL"), nullable=True)
    payload_json = Column(Text, nullable=False, default="{}")

    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
