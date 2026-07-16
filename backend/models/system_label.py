"""Application label dictionary (editable by SUPER_ADMIN)."""

from __future__ import annotations

from sqlalchemy import Column, Integer, String, Text, UniqueConstraint, text

from ..database import Base
from .base import BaseModelMixin


class SystemLabel(Base, BaseModelMixin):
    """
    Global (tenant_id NULL) or tenant-scoped label override.

    Resolution: custom_value if set, else default_value.
    """

    __tablename__ = "system_labels"
    __table_args__ = (
        UniqueConstraint("key", "tenant_id", name="uq_system_labels_key_tenant"),
    )

    key = Column(String(191), nullable=False, index=True)
    default_value = Column(Text, nullable=False, default="")
    custom_value = Column(Text, nullable=True)
    tenant_id = Column(Integer, nullable=True, index=True)
    description = Column(Text, nullable=True)
    category = Column(String(64), nullable=False, default="general", server_default=text("'general'"))
