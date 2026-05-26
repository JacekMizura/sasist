"""Centralized shipping / carrier methods per tenant + warehouse."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, text

from ..database import Base


class ShippingMethod(Base):
    __tablename__ = "shipping_methods"
    __table_args__ = (
        UniqueConstraint("tenant_id", "warehouse_id", "name", name="uq_shipping_method_tenant_wh_name"),
        UniqueConstraint("tenant_id", "warehouse_id", "code", name="uq_shipping_method_tenant_wh_code"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)

    #: Short stable key (e.g. ``OTHER``, ``INPOST``) — unique per tenant + warehouse.
    code = Column(String(64), nullable=False, default="MIGR")
    name = Column(String(256), nullable=False)
    #: JSON array of lowercase phrases matched with ``normalized_input.includes(alias)`` on import.
    aliases_json = Column(Text, nullable=True)
    logo_url = Column(String(512), nullable=True)
    is_active = Column(Boolean, nullable=False, server_default=text("true"), default=True)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)
