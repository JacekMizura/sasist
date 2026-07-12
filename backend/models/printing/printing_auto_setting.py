"""Tenant-level automatic print preferences (configuration only — no execution)."""

from __future__ import annotations

from sqlalchemy import Boolean, Column, ForeignKey, Integer, UniqueConstraint, text

from ...database import Base
from ..base import BaseModelMixin


class PrintingAutoSetting(Base, BaseModelMixin):
    __tablename__ = "printing_auto_settings"
    __table_args__ = (
        UniqueConstraint("tenant_id", name="uq_printing_auto_settings_tenant"),
    )

    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    labels = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    stock_documents = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    sale_documents = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    shipping_labels = Column(Boolean, nullable=False, default=False, server_default=text("false"))
