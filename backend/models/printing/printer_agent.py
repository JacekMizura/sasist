"""Sasist Printer Agent — Windows client registered per machine."""

from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import relationship

from ...database import Base
from ..base import BaseModelMixin


class PrinterAgent(Base, BaseModelMixin):
    __tablename__ = "printer_agents"
    __table_args__ = (
        UniqueConstraint("tenant_id", "machine_id", name="uq_printer_agent_tenant_machine"),
    )

    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True)
    machine_id = Column(String(128), nullable=False)
    name = Column(String(120), nullable=False)
    token_hash = Column(String(128), nullable=False)
    version = Column(String(32), nullable=True)
    printer_count = Column(Integer, nullable=True)
    last_seen_at = Column(DateTime, nullable=True)
    last_poll_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)
    is_online = Column(Boolean, nullable=False, default=False, server_default=text("false"))

    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
    printers = relationship(
        "AgentPrinter",
        back_populates="agent",
        cascade="all, delete-orphan",
    )
