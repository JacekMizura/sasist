"""Per-user / per-tenant list view preferences (autosave + named presets)."""

from __future__ import annotations

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text

from ..database import Base
from .base import BaseModelMixin


class UserListView(Base, BaseModelMixin):
    __tablename__ = "user_list_views"

    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="CASCADE"), nullable=True, index=True)
    screen_key = Column(String(128), nullable=False, index=True)
    type = Column(String(16), nullable=False, index=True)  # autosave | preset
    name = Column(String(255), nullable=True)
    is_default = Column(Boolean, nullable=False, default=False)
    is_public = Column(Boolean, nullable=False, default=False)
    payload_json = Column(Text, nullable=False, default="{}")
    schema_version = Column(Integer, nullable=False, default=1)
