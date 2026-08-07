"""BDO — settings + audit only. Operational ledger removed (report-only over WMS docs)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, text

from ..database import Base


class BdoSettings(Base):
    __tablename__ = "bdo_settings"

    tenant_id = Column(Integer, ForeignKey("tenants.id"), primary_key=True)

    reporting_company_name = Column(String(512), nullable=True)
    registration_numbers = Column(Text, nullable=True)
    default_methodology_text = Column(Text, nullable=True)
    allow_negative_stock = Column(Boolean, nullable=False, server_default=text("false"), default=False)

    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class BdoAuditLog(Base):
    __tablename__ = "bdo_audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    action = Column(String(128), nullable=False)
    detail = Column(Text, nullable=True)
    user_label = Column(String(256), nullable=True)
