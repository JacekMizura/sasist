"""Integration API keys — printer agents, integrations, webhooks, public API."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.orm import relationship

from ..database import Base


class IntegrationApiKey(Base):
    __tablename__ = "integration_api_keys"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    key_hash = Column(String(128), nullable=False, unique=True, index=True)
    key_prefix = Column(String(32), nullable=False)
    type = Column(String(32), nullable=False, index=True)
    scopes_json = Column(Text, nullable=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True)
    allowed_ips_json = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)
    last_used_ip = Column(String(64), nullable=True)
    last_used_user_agent = Column(String(512), nullable=True)
    usage_count = Column(Integer, nullable=False, default=0, server_default=text("0"))
    expires_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default=text("true"))

    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])

    @property
    def created_by_user_id(self) -> int | None:
        return self.created_by
