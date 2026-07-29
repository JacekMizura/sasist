"""Workstation → print-profile → agent printer mapping."""

from __future__ import annotations

from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship, synonym

from ...database import Base
from ..base import BaseModelMixin


class WorkstationPrinterMapping(Base, BaseModelMixin):
    """Maps a print profile (LABELS / DOCUMENTS / …) to an agent printer on a station.

    DB column remains ``print_type`` for backward-compatible schema; values are
    print-profile codes (see ``backend.printing_profiles``).
    """

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
    # Stored as print_type historically; holds PRINT_PROFILE_* codes.
    print_profile = Column("print_type", String(32), nullable=False, index=True)
    # Compat alias for older call sites / tests still using print_type=
    print_type = synonym("print_profile")
    agent_printer_id = Column(
        Integer,
        ForeignKey("agent_printers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    workstation = relationship("WmsWorkstation", back_populates="printer_mappings")
    agent_printer = relationship("AgentPrinter", foreign_keys=[agent_printer_id])
