"""WMS workstation — physical workplace in a warehouse (not a computer)."""

from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import relationship

from ...database import Base
from ..base import BaseModelMixin
from .constants import STATION_TYPE_OTHER


class WmsWorkstation(Base, BaseModelMixin):
    __tablename__ = "wms_workstations"
    __table_args__ = (
        UniqueConstraint("printer_agent_id", name="uq_wms_workstation_printer_agent"),
        UniqueConstraint("integration_api_key_id", name="uq_wms_workstation_api_key"),
    )

    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(
        Integer,
        ForeignKey("warehouses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(120), nullable=False)
    station_type = Column(
        String(32),
        nullable=False,
        default=STATION_TYPE_OTHER,
        server_default=text(f"'{STATION_TYPE_OTHER}'"),
        index=True,
    )
    description = Column(Text, nullable=True)
    is_default = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    is_active = Column(Boolean, nullable=False, default=True, server_default=text("true"))

    # Assigned computer (Sasist Agent) — max one workstation per agent.
    printer_agent_id = Column(
        Integer,
        ForeignKey("printer_agents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Internal pairing key — never exposed in UI API responses.
    integration_api_key_id = Column(
        Integer,
        ForeignKey("integration_api_keys.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    pairing_code_hash = Column(String(128), nullable=True, index=True)
    pairing_expires_at = Column(DateTime, nullable=True)

    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
    printer_agent = relationship("PrinterAgent", foreign_keys=[printer_agent_id])
    printer_mappings = relationship(
        "WorkstationPrinterMapping",
        back_populates="workstation",
        cascade="all, delete-orphan",
    )
    events = relationship(
        "WorkstationEvent",
        back_populates="workstation",
        cascade="all, delete-orphan",
        order_by="WorkstationEvent.created_at.desc()",
    )
