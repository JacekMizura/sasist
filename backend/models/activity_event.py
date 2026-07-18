"""
Panel Activity Log — shared history across OMS objects.

One event, many object links (order + cart + basket + rack + …).
Descriptions are Polish UI-only; filters use event_code / category / severity.
"""

from __future__ import annotations

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from ..database import Base


class ActivityEvent(Base):
    __tablename__ = "activity_events"
    __table_args__ = (
        Index("ix_activity_events_tenant_wh_occurred", "tenant_id", "warehouse_id", "occurred_at"),
        Index("ix_activity_events_code_occurred", "event_code", "occurred_at"),
        Index("ix_activity_events_category", "category"),
        Index("ix_activity_events_severity", "severity"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=True, index=True)

    #: Stable system key (filters / KPI) — never PL prose.
    event_code = Column(String(64), nullable=False, index=True)
    #: Polish description for UI only.
    description = Column(String(512), nullable=False)
    #: INFO | SUCCESS | WARNING | ERROR | AUDIT
    severity = Column(String(16), nullable=False, default="INFO")
    #: Coarse filter bucket: picking | packing | status | capacity | system | …
    category = Column(String(32), nullable=False, default="system", index=True)

    actor_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    occurred_at = Column(DateTime, nullable=False, server_default=func.now(), index=True)

    source_module = Column(String(64), nullable=True)
    correlation_id = Column(String(64), nullable=True, index=True)
    metadata_json = Column(Text, nullable=True)


class ActivityEventLink(Base):
    __tablename__ = "activity_event_links"
    __table_args__ = (
        UniqueConstraint(
            "event_id",
            "object_type",
            "object_id",
            name="uq_activity_event_link_object",
        ),
        Index("ix_activity_event_links_object", "object_type", "object_id", "event_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(
        Integer,
        ForeignKey("activity_events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    #: cart | order | basket | rack | carrier | product | operator | …
    object_type = Column(String(32), nullable=False)
    object_id = Column(Integer, nullable=False)
    #: primary | related | subject | target
    role = Column(String(24), nullable=False, default="related")
    #: Optional display label for clickable chip (e.g. CART-0001, #100245)
    object_label = Column(String(128), nullable=True)
