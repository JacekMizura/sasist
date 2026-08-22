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

# Outbound delivery lifecycle (SSOT).
EMAIL_PENDING = "PENDING"
EMAIL_SENDING = "SENDING"
EMAIL_SENT = "SENT"
EMAIL_FAILED = "FAILED"


class MessageTemplate(Base):
    """Tenant-owned message template (email / sms / note) — SSOT for Automation + Poczta."""

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
    #: email | sms | note
    channel = Column(String(16), nullable=False, default="email")
    #: Supported entity contexts (canonical CSV). Legacy: ALL|ORDER|RETURN|COMPLAINT still parsed.
    #: Examples: "ORDER", "ORDER,RETURN", "ORDER,RETURN,COMPLAINT"
    entity_scope = Column(String(128), nullable=False, default="ORDER,RETURN,COMPLAINT")
    subject_template = Column(String(512), nullable=False, default="")
    body_template = Column(Text, nullable=False, default="")
    #: JSON list of attachment sources, e.g. [{"source":"order_custom_field","field_id":1}]
    attachments_json = Column(Text, nullable=False, default="[]")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class OutboundEmailMessage(Base):
    """
    Idempotent outbound email outbox.

    Automation enqueues PENDING. Delivery worker + EmailProvider move to SENT/FAILED.
    SENT means the provider accepted the message — never set on enqueue alone.
    """

    __tablename__ = "outbound_email_messages"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_outbound_email_idempotency"),
        Index("ix_outbound_email_tenant_entity", "tenant_id", "entity_type", "entity_id"),
        Index("ix_outbound_email_status", "status"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=True)
    entity_type = Column(String(32), nullable=False)
    entity_id = Column(Integer, nullable=False)
    template_id = Column(Integer, ForeignKey("message_templates.id", ondelete="SET NULL"), nullable=True)
    recipient_email = Column(String(320), nullable=False)
    recipient_type = Column(String(32), nullable=False, default="CUSTOMER")
    #: Snapshot at enqueue — immutable thereafter.
    subject = Column(String(512), nullable=False, default="")
    body = Column(Text, nullable=False, default="")
    context_json = Column(Text, nullable=False, default="{}")
    status = Column(String(24), nullable=False, default=EMAIL_PENDING)
    provider = Column(String(64), nullable=True)
    provider_message_id = Column(String(191), nullable=True)
    attempt_count = Column(Integer, nullable=False, default=0)
    last_attempt_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)
    #: Legacy alias column kept in sync with last_error for older readers.
    error = Column(Text, nullable=True)
    idempotency_key = Column(String(191), nullable=False)
    automation_execution_id = Column(Integer, nullable=True, index=True)
    automation_effect_id = Column(Integer, nullable=True, index=True)
    #: Manual mail module linkage (Phase 2+).
    conversation_id = Column(Integer, ForeignKey("mail_conversations.id", ondelete="SET NULL"), nullable=True, index=True)
    mail_account_id = Column(Integer, ForeignKey("mail_accounts.id", ondelete="SET NULL"), nullable=True)
    mail_message_id = Column(Integer, ForeignKey("mail_messages.id", ondelete="SET NULL"), nullable=True)
    source = Column(String(32), nullable=True)
    sent_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    message_id_header = Column(String(512), nullable=True)
    in_reply_to = Column(String(512), nullable=True)
    references_header = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    sent_at = Column(DateTime, nullable=True)
    failed_at = Column(DateTime, nullable=True)
