"""Print-type → agent printer mapping — belongs to the workstation."""

from __future__ import annotations

from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from ...database import Base
from ..base import BaseModelMixin


class WorkstationPrinterMapping(Base, BaseModelMixin):
    __tablename__ = "wms_workstation_printer_mappings"
    __table_args__ = (
        UniqueConstraint(
            "workstation_id",
            "print_type",
            name="uq_wms_ws_printer_mapping_type",
        ),
    )

    workstation_id = Column(
        Integer,
        ForeignKey("wms_workstations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    print_type = Column(String(32), nullable=False, index=True)
    agent_printer_id = Column(
        Integer,
        ForeignKey("agent_printers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    workstation = relationship("WmsWorkstation", back_populates="printer_mappings")
    agent_printer = relationship("AgentPrinter", foreign_keys=[agent_printer_id])
