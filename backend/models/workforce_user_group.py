"""Configurable operational user groups (teams) for WMS workforce management."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from ..database import Base
from .base import BaseModelMixin


class WorkforceUserGroup(Base, BaseModelMixin):
    """Admin-defined team (Biuro, Magazynier, …) with optional default permissions / WMS modes."""

    __tablename__ = "workforce_user_groups"

    name = Column(String(128), nullable=False)
    color = Column(String(32), nullable=False, default="#64748b")
    icon_key = Column(String(64), nullable=False, default="Users")
    archived_at = Column(DateTime, nullable=True, index=True)
    default_permission_keys_json = Column(Text, nullable=True)
    default_wms_modes_json = Column(Text, nullable=True)


class WorkforceUserStatusAccess(Base):
    """Per-user overrides on top of role-based panel status matrix (order_ui_statuses)."""

    __tablename__ = "workforce_user_status_access"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "warehouse_id",
            "user_id",
            "order_ui_status_id",
            name="uq_workforce_user_status_access_row",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False, index=True)
    order_ui_status_id = Column(Integer, ForeignKey("order_ui_statuses.id", ondelete="CASCADE"), nullable=False, index=True)

    can_visible = Column(Boolean, nullable=False, default=True)
    can_edit = Column(Boolean, nullable=False, default=False)
    can_transition = Column(Boolean, nullable=False, default=False)
    can_process = Column(Boolean, nullable=False, default=False)
    can_print = Column(Boolean, nullable=False, default=False)
    can_complete = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)
