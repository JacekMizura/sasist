"""Platform users (office auth) and separate WMS operational profiles."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, text

from ..database import Base
from .base import BaseModelMixin


class AppUser(Base, BaseModelMixin):
    """Office / platform authentication account (no WMS workstation fields here)."""

    __tablename__ = "app_users"

    login = Column(String(128), unique=True, nullable=False, index=True)
    email = Column(String(255), nullable=True, index=True)
    password_hash = Column(String(255), nullable=False)

    first_name = Column(String(128), nullable=True)
    last_name = Column(String(128), nullable=True)
    phone = Column(String(64), nullable=True)
    avatar_url = Column(String(512), nullable=True)

    role = Column(String(64), nullable=False, default="user")

    is_active = Column(Boolean, nullable=False, default=True)

    # Panel (office) UI language — distinct from WMS profile language.
    language = Column(String(16), nullable=False, default="pl")

    # Denormalized WMS locale mirrors (also stored on ``user_wms_profiles``); required for NOT NULL inserts.
    wms_language = Column(String(16), nullable=False, default="pl", server_default=text("'pl'"))
    wms_currency = Column(String(8), nullable=False, default="PLN", server_default=text("'PLN'"))

    last_login_at = Column(DateTime, nullable=True)

    is_system_seed = Column(Boolean, nullable=False, default=False)
    password_must_change = Column(Boolean, nullable=False, default=False)

    # System / owner protection (UI + API guards).
    is_system_user = Column(Boolean, nullable=False, default=False, server_default=text("0"))
    is_owner = Column(Boolean, nullable=False, default=False, server_default=text("0"))
    is_deletable = Column(Boolean, nullable=False, default=True, server_default=text("1"))
    is_role_changeable = Column(Boolean, nullable=False, default=True, server_default=text("1"))

    primary_workforce_group_id = Column(
        Integer,
        ForeignKey("workforce_user_groups.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )


class UserWmsProfile(Base, BaseModelMixin):
    """Warehouse terminal / workstation preferences — one row per platform user."""

    __tablename__ = "user_wms_profiles"

    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)

    barcode_login_code = Column(String(128), nullable=True, index=True)
    language = Column(String(16), nullable=False, default="pl")
    default_warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True)
    active_warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True)

    require_scan_every_product = Column(Boolean, nullable=False, default=False)
    can_edit_products_preview = Column(Boolean, nullable=False, default=False)

    picking_permissions_json = Column(Text, nullable=True)
    packing_permissions_json = Column(Text, nullable=True)

    picker_color = Column(String(32), nullable=True)
    packing_station_id = Column(Integer, nullable=True)
    default_printer_id = Column(Integer, nullable=True)
    timezone = Column(String(64), nullable=False, default="Europe/Warsaw")

    wms_operational_modes_json = Column(Text, nullable=True)
    workforce_supervisor_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)
    workforce_employment_type = Column(String(32), nullable=True)
    workforce_shift_type = Column(String(32), nullable=True)
    workforce_active_zone_ids_json = Column(Text, nullable=True)
    workforce_default_workstation = Column(String(128), nullable=True)
    workforce_color_tag = Column(String(32), nullable=True)


class AppUserWarehouse(Base):
    """User ↔ warehouse assignment (scope for office + WMS)."""

    __tablename__ = "app_user_warehouses"
    __table_args__ = (UniqueConstraint("user_id", "warehouse_id", name="uq_app_user_warehouse"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)


class UserPermission(Base):
    __tablename__ = "user_permissions"
    __table_args__ = (UniqueConstraint("user_id", "permission_key", name="uq_app_user_permission"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False, index=True)
    permission_key = Column(String(128), nullable=False, index=True)


class UserSession(Base):
    """Refresh tokens — store SHA-256 hash only."""

    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False, index=True)
    refresh_token_hash = Column(String(128), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    user_agent = Column(String(512), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String(160), nullable=False, index=True)
    entity_type = Column(String(80), nullable=True)
    entity_id = Column(Integer, nullable=True)
    detail_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
