"""Edge Device Registry ORM models — type-agnostic persistence."""

from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
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


class EdgeDevice(Base, BaseModelMixin):
    """Universal device row — Agent → Devices. No type-specific columns."""

    __tablename__ = "edge_devices"
    __table_args__ = (
        UniqueConstraint("agent_id", "module_id", "local_id", name="uq_edge_device_agent_module_local"),
    )

    tenant_id = Column(Integer, nullable=False, index=True)
    agent_id = Column(
        Integer,
        ForeignKey("printer_agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    local_id = Column(String(255), nullable=False)
    device_type = Column(String(32), nullable=False, index=True)
    module_id = Column(String(64), nullable=False, index=True)
    display_name = Column(String(120), nullable=False)
    manufacturer = Column(String(120), nullable=True)
    model = Column(String(120), nullable=True)
    serial_number = Column(String(120), nullable=True)
    driver = Column(String(120), nullable=True)
    firmware = Column(String(120), nullable=True)
    status = Column(String(32), nullable=False, default="unknown", server_default=text("'unknown'"))
    capabilities_json = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
    configuration_json = Column(Text, nullable=True)
    configuration_version = Column(String(64), nullable=True)
    health_score = Column(Float, nullable=True)
    health_json = Column(Text, nullable=True)
    last_seen_at = Column(DateTime, nullable=True, index=True)
    sync_revision = Column(String(64), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    is_default = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    # Optional link to legacy agent_printers.id for printing compat
    legacy_printer_id = Column(Integer, nullable=True, index=True)

    events = relationship("EdgeDeviceEvent", back_populates="device", cascade="all, delete-orphan")


class EdgeDeviceEvent(Base, BaseModelMixin):
    __tablename__ = "edge_device_events"

    tenant_id = Column(Integer, nullable=False, index=True)
    agent_id = Column(
        Integer,
        ForeignKey("printer_agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_id = Column(
        Integer,
        ForeignKey("edge_devices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    local_device_id = Column(String(255), nullable=True)
    event_type = Column(String(64), nullable=False, index=True)
    module_id = Column(String(64), nullable=True)
    device_type = Column(String(32), nullable=True)
    occurred_at = Column(DateTime, nullable=False, index=True)
    payload_json = Column(Text, nullable=True)

    device = relationship("EdgeDevice", back_populates="events")


class EdgeDeviceAction(Base, BaseModelMixin):
    """Queued remote actions for an agent (ERP → Agent via sync)."""

    __tablename__ = "edge_device_actions"

    tenant_id = Column(Integer, nullable=False, index=True)
    agent_id = Column(
        Integer,
        ForeignKey("printer_agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    correlation_id = Column(String(64), nullable=False, unique=True, index=True)
    action = Column(String(64), nullable=False)
    module_id = Column(String(64), nullable=True)
    device_local_id = Column(String(255), nullable=True)
    parameters_json = Column(Text, nullable=True)
    status = Column(String(32), nullable=False, default="pending", server_default=text("'pending'"), index=True)
    result_json = Column(Text, nullable=True)
    error_code = Column(String(64), nullable=True)
    error_message = Column(Text, nullable=True)
    completed_at = Column(DateTime, nullable=True)
