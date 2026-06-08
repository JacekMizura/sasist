"""Immutable audit trail for inventory module events."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, Index

from ...database import Base


class InventoryAuditEvent(Base):
    __tablename__ = "inventory_audit_events"
    __table_args__ = (
        Index("ix_inv_audit_doc_created", "inventory_document_id", "created_at"),
    )

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    inventory_document_id = Column(
        Integer,
        ForeignKey("inventory_documents.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    inventory_document_line_id = Column(
        Integer,
        ForeignKey("inventory_document_lines.id", ondelete="SET NULL"),
        nullable=True,
    )
    inventory_task_id = Column(Integer, ForeignKey("inventory_tasks.id", ondelete="SET NULL"), nullable=True)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)

    action = Column(String(64), nullable=False, index=True)
    entity_type = Column(String(64), nullable=True)
    entity_id = Column(Integer, nullable=True)
    detail_json = Column(Text, nullable=True)
    ip_address = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class InventoryLineAttachment(Base):
    """Placeholder for photo attachments on count lines."""

    __tablename__ = "inventory_line_attachments"

    id = Column(Integer, primary_key=True)
    inventory_document_line_id = Column(
        Integer,
        ForeignKey("inventory_document_lines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    uploaded_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    file_path = Column(String(512), nullable=False)
    mime_type = Column(String(128), nullable=True)
    caption = Column(String(256), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
