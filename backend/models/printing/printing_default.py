"""Tenant/warehouse default printer selection per printer type."""

from __future__ import annotations

from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from ...database import Base
from ..base import BaseModelMixin


class PrintingDefault(Base, BaseModelMixin):
    __tablename__ = "printing_defaults"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "warehouse_id",
            "printer_type",
            name="uq_printing_default_tenant_wh_type",
        ),
    )

    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=True, index=True)
    printer_type = Column(String(16), nullable=False)
    agent_printer_id = Column(
        Integer,
        ForeignKey("agent_printers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    agent_printer = relationship("AgentPrinter", foreign_keys=[agent_printer_id])
