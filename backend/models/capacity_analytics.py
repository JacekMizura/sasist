"""
Capacity Analytics — diagnostic store for Capacity Engine runs.

Separate from Activity / Event Log. Stores aggregates + lazy detail rows.
"""

from __future__ import annotations

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from ..database import Base


class CapacityAnalyticsRun(Base):
    __tablename__ = "capacity_analytics_runs"
    __table_args__ = (
        Index("ix_cap_analytics_runs_cart_occurred", "cart_id", "occurred_at"),
        Index("ix_cap_analytics_runs_tenant_wh_occurred", "tenant_id", "warehouse_id", "occurred_at"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    cart_id = Column(Integer, ForeignKey("carts.id", ondelete="CASCADE"), nullable=False, index=True)
    occurred_at = Column(DateTime, nullable=False, server_default=func.now(), index=True)
    operator_user_id = Column(Integer, nullable=True, index=True)
    source = Column(String(64), nullable=False, default="start_picking")
    strategy = Column(String(64), nullable=True)
    candidates_count = Column(Integer, nullable=False, default=0)
    assigned_count = Column(Integer, nullable=False, default=0)
    rejected_count = Column(Integer, nullable=False, default=0)
    cart_label = Column(String(128), nullable=True)


class CapacityAnalyticsReasonAgg(Base):
    __tablename__ = "capacity_analytics_reason_aggs"
    __table_args__ = (
        UniqueConstraint("run_id", "reason_code", name="uq_cap_analytics_reason_run_code"),
        Index("ix_cap_analytics_reason_code", "reason_code"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(
        Integer,
        ForeignKey("capacity_analytics_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reason_code = Column(String(64), nullable=False)
    reason_label = Column(String(256), nullable=False)
    count = Column(Integer, nullable=False, default=0)


class CapacityAnalyticsDetail(Base):
    """Per-order outcome for a run — loaded only on demand (paginated)."""

    __tablename__ = "capacity_analytics_details"
    __table_args__ = (
        Index("ix_cap_analytics_details_run_reason", "run_id", "reason_code", "id"),
        Index("ix_cap_analytics_details_order", "order_id", "occurred_at"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(
        Integer,
        ForeignKey("capacity_analytics_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tenant_id = Column(Integer, nullable=False, index=True)
    warehouse_id = Column(Integer, nullable=False, index=True)
    cart_id = Column(Integer, nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    order_number = Column(String(64), nullable=True)
    result = Column(String(16), nullable=False)  # assigned | rejected
    reason_code = Column(String(64), nullable=True)
    reason_label = Column(String(256), nullable=True)
    occurred_at = Column(DateTime, nullable=False, server_default=func.now())
    operator_user_id = Column(Integer, nullable=True)
    cart_label = Column(String(128), nullable=True)
