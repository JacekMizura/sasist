"""Async document generation jobs — fiscal/KSeF/retry ready."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from ..database import Base

JOB_PENDING = "PENDING"
JOB_PROCESSING = "PROCESSING"
JOB_GENERATED = "GENERATED"
JOB_FAILED = "FAILED"
JOB_RETRYING = "RETRYING"
JOB_CANCELLED = "CANCELLED"

JOB_STATUSES = (
    JOB_PENDING,
    JOB_PROCESSING,
    JOB_GENERATED,
    JOB_FAILED,
    JOB_RETRYING,
    JOB_CANCELLED,
)


class DocumentGenerationJob(Base):
    __tablename__ = "document_generation_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    session_id = Column(Integer, ForeignKey("direct_sale_sessions.id", ondelete="SET NULL"), nullable=True)
    document_type = Column(String(24), nullable=False)
    document_subtype = Column(String(32), nullable=False)
    series_id = Column(String(36), ForeignKey("document_series.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(16), nullable=False, default=JOB_PENDING, index=True)
    attempt_count = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=3)
    sale_document_id = Column(String(36), nullable=True)
    error_message = Column(Text, nullable=True)
    fiscal_status = Column(String(24), nullable=True)
    fiscal_ref = Column(String(128), nullable=True)
    payload_json = Column(Text, nullable=False, default="{}")
    result_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    next_retry_at = Column(DateTime, nullable=True, index=True)
