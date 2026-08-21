"""Outbound messaging SSOT — email templates + idempotent outbox."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Index,
)

from ..database import Base


class MessageTemplate(Base):
    """Tenant-owned message template (email channel for Automation Engine)."""

    __tablename__ = "message_templates"
    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_message_templates_tenant_code"),
        Index("ix_message_templates_tenant_active", "tenant_id", "is_active"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=True, index=True)
    code = Column(String(64), nullable=False)
    name = Column(String(255), nullable=False)
    channel = Column(String(16), nullable=False, default="email")  # email only for now
    #: ORDER | RETURN | COMPLAINT | ALL
    entity_scope = Column(String(32), nullable=False, default="ALL")
    subject_template = Column(String(512), nullable=False, default="")
    body_template = Column(Text, nullable=False, default="")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class OutboundEmailMessage(Base):
    """
    Idempotent outbound email record.

    Unique idempotency_key prevents duplicate sends on crash/retry.
    Provider transport is pluggable; v1 records outbox SENT without external SMTP.
    """

    __tablename__ = "outbound_email_messages"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_outbound_email_idempotency"),
        Index("ix_outbound_email_tenant_entity", "tenant_id", "entity_type", "entity_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=True)
    entity_type = Column(String(32), nullable=False)
    entity_id = Column(Integer, nullable=False)
    template_id = Column(Integer, ForeignKey("message_templates.id", ondelete="SET NULL"), nullable=True)
    recipient_email = Column(String(320), nullable=False)
    recipient_type = Column(String(32), nullable=False, default="CUSTOMER")
    subject = Column(String(512), nullable=False, default="")
    body = Column(Text, nullable=False, default="")
    context_json = Column(Text, nullable=False, default="{}")
    status = Column(String(24), nullable=False, default="QUEUED")  # QUEUED|SENT|FAILED
    provider = Column(String(64), nullable=False, default="outbox")
    provider_message_id = Column(String(191), nullable=True)
    error = Column(Text, nullable=True)
    #: Deterministic: ae:{automation_execution_id}:{automation_effect_id}
    idempotency_key = Column(String(191), nullable=False)
    automation_execution_id = Column(Integer, nullable=True, index=True)
    automation_effect_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    sent_at = Column(DateTime, nullable=True)
