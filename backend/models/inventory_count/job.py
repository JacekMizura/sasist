"""Background jobs for heavy inventory operations (reports, audit ZIP, snapshots)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, Index

from ...database import Base

JOB_PENDING = "pending"
JOB_PROCESSING = "processing"
JOB_COMPLETED = "completed"
JOB_FAILED = "failed"
JOB_CANCELLED = "cancelled"

JOB_KIND_REPORT = "report"
JOB_KIND_AUDIT_PACKAGE = "audit_package"
JOB_KIND_SNAPSHOT = "snapshot"

JOB_STATUSES = (JOB_PENDING, JOB_PROCESSING, JOB_COMPLETED, JOB_FAILED, JOB_CANCELLED)


class InventoryJob(Base):
    __tablename__ = "inventory_jobs"
    __table_args__ = (
        Index("ix_inv_jobs_tenant_status", "tenant_id", "status"),
        Index("ix_inv_jobs_doc_kind", "inventory_document_id", "job_kind"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    inventory_document_id = Column(
        Integer,
        ForeignKey("inventory_documents.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    job_kind = Column(String(32), nullable=False, index=True)
    status = Column(String(24), nullable=False, default=JOB_PENDING, index=True)
    payload_json = Column(Text, nullable=False, default="{}")
    result_json = Column(Text, nullable=True)
    output_path = Column(String(512), nullable=True)
    error_message = Column(Text, nullable=True)
    progress_percent = Column(Integer, nullable=False, default=0)
    attempt_count = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=3)
    requested_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    idempotency_key = Column(String(128), nullable=True, unique=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    next_retry_at = Column(DateTime, nullable=True, index=True)
