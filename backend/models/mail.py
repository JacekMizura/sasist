"""Mail module — accounts, conversations, messages (Phase 1 inbound foundation)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)

from ..database import Base

# Conversation status (Communication domain — not Order/Return statuses).
CONV_STATUS_OPEN = "OPEN"
CONV_STATUS_IN_PROGRESS = "IN_PROGRESS"
CONV_STATUS_WAITING_CUSTOMER = "WAITING_CUSTOMER"
CONV_STATUS_CLOSED = "CLOSED"
CONV_STATUS_SNOOZED = "SNOOZED"
CONV_STATUS_SPAM = "SPAM"
CONV_STATUS_TRASH = "TRASH"

CONV_PRIORITY_NONE = "NONE"
CONV_PRIORITY_LOW = "LOW"
CONV_PRIORITY_NORMAL = "NORMAL"
CONV_PRIORITY_HIGH = "HIGH"
CONV_PRIORITY_URGENT = "URGENT"

MSG_DIRECTION_INBOUND = "INBOUND"
MSG_DIRECTION_OUTBOUND = "OUTBOUND"

OUTBOUND_SOURCE_MANUAL = "MANUAL"
OUTBOUND_SOURCE_AUTOMATION = "AUTOMATION"
ENTITY_MAIL_CONVERSATION = "MAIL_CONVERSATION"

RELATION_ORDER = "ORDER"
RELATION_RETURN = "RETURN"
RELATION_COMPLAINT = "COMPLAINT"
RELATION_CUSTOMER = "CUSTOMER"

IMAP_SECURITY_SSL = "SSL"
IMAP_SECURITY_TLS = "TLS"
IMAP_SECURITY_NONE = "NONE"

SMTP_SECURITY_SSL = "SSL"
SMTP_SECURITY_TLS = "TLS"
SMTP_SECURITY_NONE = "NONE"

PROVIDER_MANUAL = "MANUAL"
PROVIDER_GOOGLE_OAUTH = "GOOGLE_OAUTH"


class MailAccount(Base):
    """Tenant-owned mailbox account (manual IMAP/SMTP or Google OAuth + Gmail API)."""

    __tablename__ = "mail_accounts"
    __table_args__ = (
        Index("ix_mail_accounts_tenant_active", "tenant_id", "is_active"),
        Index("ix_mail_accounts_tenant_provider", "tenant_id", "provider_type"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    email_address = Column(String(320), nullable=False)
    provider_type = Column(String(32), nullable=False, default=PROVIDER_MANUAL)

    imap_host = Column(String(255), nullable=True)
    imap_port = Column(Integer, nullable=True)
    imap_security = Column(String(16), nullable=True, default=IMAP_SECURITY_SSL)
    imap_username = Column(String(255), nullable=True)
    imap_password_ciphertext = Column(Text, nullable=True)

    smtp_host = Column(String(255), nullable=True)
    smtp_port = Column(Integer, nullable=True)
    smtp_security = Column(String(16), nullable=True, default=SMTP_SECURITY_TLS)
    smtp_username = Column(String(255), nullable=True)
    smtp_password_ciphertext = Column(Text, nullable=True)

    google_email = Column(String(320), nullable=True)
    google_subject = Column(String(128), nullable=True)
    google_refresh_token_ciphertext = Column(Text, nullable=True)
    google_access_token_ciphertext = Column(Text, nullable=True)
    google_access_token_expires_at = Column(DateTime, nullable=True)
    google_granted_scopes = Column(Text, nullable=True)
    oauth_connected_at = Column(DateTime, nullable=True)
    oauth_last_error = Column(Text, nullable=True)
    gmail_history_id = Column(String(32), nullable=True)

    is_send_only = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)

    last_sync_at = Column(DateTime, nullable=True)
    last_sync_uid = Column(Integer, nullable=False, default=0)
    last_sync_error = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class MailConversation(Base):
    """
    Email thread / ticket — not tied to a single MailAccount.

    Messages carry account_id; conversation spans accounts when needed.
    """

    __tablename__ = "mail_conversations"
    __table_args__ = (
        Index("ix_mail_conv_tenant_status_last_msg", "tenant_id", "status", "last_message_at"),
        Index("ix_mail_conv_tenant_assigned", "tenant_id", "assigned_user_id", "status"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(32), nullable=False, default=CONV_STATUS_OPEN)
    priority = Column(String(16), nullable=False, default=CONV_PRIORITY_NORMAL)
    assigned_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    subject = Column(String(998), nullable=False, default="")
    last_message_at = Column(DateTime, nullable=True)
    last_inbound_at = Column(DateTime, nullable=True)
    last_outbound_at = Column(DateTime, nullable=True)
    unread_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    closed_at = Column(DateTime, nullable=True)


class MailConversationRelation(Base):
    """Optional entity links for a conversation (one per relation_type)."""

    __tablename__ = "mail_conversation_relations"
    __table_args__ = (
        UniqueConstraint("conversation_id", "relation_type", name="uq_mail_conv_relation_type"),
        Index("ix_mail_conv_rel_tenant_type", "tenant_id", "relation_type", "relation_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(
        Integer,
        ForeignKey("mail_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    relation_type = Column(String(32), nullable=False)
    relation_id = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    created_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)


class MailMessage(Base):
    """Single email in a conversation."""

    __tablename__ = "mail_messages"
    __table_args__ = (
        UniqueConstraint("account_id", "imap_uid", name="uq_mail_msg_account_imap_uid"),
        UniqueConstraint("account_id", "message_id_header", name="uq_mail_msg_account_message_id"),
        UniqueConstraint("account_id", "gmail_message_id", name="uq_mail_msg_account_gmail_id"),
        Index("ix_mail_msg_conversation_received", "conversation_id", "received_at"),
        Index("ix_mail_msg_tenant_message_id", "tenant_id", "message_id_header"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(
        Integer,
        ForeignKey("mail_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    account_id = Column(Integer, ForeignKey("mail_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    direction = Column(String(16), nullable=False, default=MSG_DIRECTION_INBOUND)

    sender_email = Column(String(320), nullable=False, default="")
    to_json = Column(Text, nullable=False, default="[]")
    cc_json = Column(Text, nullable=False, default="[]")

    subject = Column(String(998), nullable=False, default="")
    text_body = Column(Text, nullable=False, default="")
    #: Raw HTML from provider — MUST be sanitized before any UI render (Phase 2+).
    html_body_raw = Column(Text, nullable=True)

    message_id_header = Column(String(512), nullable=True)
    in_reply_to = Column(String(512), nullable=True)
    references_header = Column(Text, nullable=True)

    imap_uid = Column(Integer, nullable=True)
    gmail_message_id = Column(String(128), nullable=True)
    gmail_thread_id = Column(String(128), nullable=True)
    received_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    outbound_message_id = Column(
        Integer,
        ForeignKey("outbound_email_messages.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    sent_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)


class MailConversationReadState(Base):
    """Per-user read cursor — global unread_count on conversation is not SSOT for operators."""

    __tablename__ = "mail_conversation_read_states"
    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id", name="uq_mail_conv_read_user"),
        Index("ix_mail_conv_read_user", "user_id", "conversation_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(
        Integer,
        ForeignKey("mail_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False, index=True)
    last_read_message_id = Column(Integer, ForeignKey("mail_messages.id", ondelete="SET NULL"), nullable=True)
    last_read_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class MailConversationAuditEvent(Base):
    """Lightweight conversation audit trail (not email body)."""

    __tablename__ = "mail_conversation_audit_events"
    __table_args__ = (Index("ix_mail_conv_audit_conv_created", "conversation_id", "created_at"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(
        Integer,
        ForeignKey("mail_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type = Column(String(64), nullable=False)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    payload_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
