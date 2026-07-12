"""Print job queue — browser creates, agent processes."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from ...database import Base
from .constants import JOB_STATUS_PENDING, JOB_TYPE_PDF, SOURCE_MODULE_SYSTEM


class PrintJob(Base):
    __tablename__ = "print_jobs"
    __table_args__ = (
        Index("ix_print_jobs_status_printer_created", "status", "printer_id", "created_at"),
        Index("ix_print_jobs_tenant_created", "tenant_id", "created_at"),
        Index("ix_print_jobs_parent", "parent_job_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True)
    printer_id = Column(
        Integer,
        ForeignKey("agent_printers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_type = Column(String(64), nullable=False)
    document_id = Column(Integer, nullable=True)
    payload_json = Column(Text, nullable=False, default="{}")
    status = Column(String(32), nullable=False, default=JOB_STATUS_PENDING, index=True)
    error_message = Column(Text, nullable=True)
    copies = Column(Integer, nullable=False, default=1)
    parent_job_id = Column(Integer, ForeignKey("print_jobs.id", ondelete="SET NULL"), nullable=True)
    retry_number = Column(Integer, nullable=False, default=0)
    deleted_at = Column(DateTime, nullable=True, index=True)
    source_module = Column(String(32), nullable=False, default=SOURCE_MODULE_SYSTEM)
    job_type = Column(String(24), nullable=False, default=JOB_TYPE_PDF)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    printer = relationship("AgentPrinter", back_populates="print_jobs")
    parent_job = relationship("PrintJob", remote_side=[id], foreign_keys=[parent_job_id])
