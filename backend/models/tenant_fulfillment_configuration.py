"""Tenant-level policy: how fulfillment warehouse is chosen for new orders (P2.5)."""

from __future__ import annotations

from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint

from ..database import Base
from .base import BaseModelMixin


class TenantFulfillmentConfiguration(Base, BaseModelMixin):
    __tablename__ = "tenant_fulfillment_configurations"
    __table_args__ = (UniqueConstraint("tenant_id", name="uq_tenant_fulfillment_configuration_tenant"),)

    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    fulfillment_assignment_mode = Column(String(32), nullable=False, default="DEFAULT_WAREHOUSE", index=True)
