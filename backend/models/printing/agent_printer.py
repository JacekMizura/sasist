"""Physical printer discovered by a Sasist Printer Agent."""

from __future__ import annotations

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import relationship

from ...database import Base
from ..base import BaseModelMixin
from .constants import PRINTER_TYPE_OTHER


class AgentPrinter(Base, BaseModelMixin):
    __tablename__ = "agent_printers"
    __table_args__ = (
        UniqueConstraint("agent_id", "system_name", name="uq_agent_printer_system_name"),
    )

    agent_id = Column(
        Integer,
        ForeignKey("printer_agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(120), nullable=False)
    system_name = Column(String(255), nullable=False)
    printer_type = Column(String(16), nullable=False, default=PRINTER_TYPE_OTHER, index=True)
    is_default = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    capabilities_json = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default=text("true"))

    agent = relationship("PrinterAgent", back_populates="printers")
    print_jobs = relationship("PrintJob", back_populates="printer")
