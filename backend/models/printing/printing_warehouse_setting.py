"""Warehouse-scoped printing preferences (feature flags)."""

from __future__ import annotations

from sqlalchemy import Boolean, Column, ForeignKey, Integer, UniqueConstraint, text

from ...database import Base
from ..base import BaseModelMixin


class PrintingWarehouseSetting(Base, BaseModelMixin):
    __tablename__ = "printing_warehouse_settings"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "warehouse_id",
            name="uq_printing_warehouse_settings_tenant_wh",
        ),
    )

    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(
        Integer,
        ForeignKey("warehouses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    prefer_sasist_agent = Column(Boolean, nullable=False, default=False, server_default=text("false"))
