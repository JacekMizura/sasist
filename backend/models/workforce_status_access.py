"""Per-role access flags for panel order UI statuses (operational RBAC layer)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from ..database import Base


class WorkforceStatusAccess(Base):
    __tablename__ = "workforce_status_access"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "warehouse_id",
            "role",
            "order_ui_status_id",
            name="uq_workforce_status_access_row",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(64), nullable=False, index=True)
    order_ui_status_id = Column(Integer, ForeignKey("order_ui_statuses.id", ondelete="CASCADE"), nullable=False, index=True)

    can_visible = Column(Boolean, nullable=False, default=True)
    can_edit = Column(Boolean, nullable=False, default=False)
    can_transition = Column(Boolean, nullable=False, default=False)
    can_process = Column(Boolean, nullable=False, default=False)
    can_print = Column(Boolean, nullable=False, default=False)
    can_complete = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)
