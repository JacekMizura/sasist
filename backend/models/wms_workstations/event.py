"""Business timeline events for a WMS workstation."""

from __future__ import annotations

from sqlalchemy import Column, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from ...database import Base
from ..base import BaseModelMixin


class WorkstationEvent(Base, BaseModelMixin):
    __tablename__ = "wms_workstation_events"
    __table_args__ = (
        Index("ix_wms_ws_events_ws_created", "workstation_id", "created_at"),
    )

    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    workstation_id = Column(
        Integer,
        ForeignKey("wms_workstations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type = Column(String(64), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    detail = Column(Text, nullable=True)
    actor_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)

    workstation = relationship("WmsWorkstation", back_populates="events")
