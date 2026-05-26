"""Superadmin-defined permission presets (stored in DB)."""

from __future__ import annotations

from sqlalchemy import Column, ForeignKey, Integer, String, Text

from ..database import Base
from .base import BaseModelMixin


class PermissionPreset(Base, BaseModelMixin):
    """Named permission bundles created by super administrators."""

    __tablename__ = "permission_presets"

    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    # personal = visible only to creator; organization = all super roles
    visibility = Column(String(32), nullable=False, default="personal")
    permission_keys_json = Column(Text, nullable=False)
    created_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)
