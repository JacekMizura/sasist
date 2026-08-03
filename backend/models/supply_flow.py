"""Supply Flow ORM — config (warehouse) + living plan projection + phase history."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from ..database import Base


class SupplyFlowWarehouseConfig(Base):
    """
    Warehouse-level Supply Flow configuration (not an orchestration result).

    Engine reads this, then generates Living SupplyFlowPlan.
    """

    __tablename__ = "supply_flow_warehouse_configs"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "warehouse_id", name="uq_supply_flow_warehouse_configs_tenant_wh"
        ),
    )

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(
        Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    optimization_goal = Column(String(64), nullable=False, default="MAX_SHIPPED_ORDERS")
    planning_horizon_hours = Column(Integer, nullable=False, default=24)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])


class SupplyFlowPhaseHistory(Base):
    """Audit of operational phase transitions on an inbound delivery."""

    __tablename__ = "supply_flow_phase_history"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    delivery_id = Column(
        Integer, ForeignKey("deliveries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_phase = Column(String(64), nullable=True)
    to_phase = Column(String(64), nullable=False, index=True)
    changed_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    source = Column(String(64), nullable=False, default="system")
    comment = Column(Text, nullable=True)
    is_automatic = Column(Boolean, nullable=False, default=True)

    delivery = relationship("InboundDelivery", back_populates="supply_flow_phase_history")


class SupplyFlowPlan(Base):
    """
    Living SupplyFlowPlan — orchestration result for one warehouse.

    Does NOT store optimization_goal / planning_horizon (those live on config).
    """

    __tablename__ = "supply_flow_plans"
    __table_args__ = (
        UniqueConstraint("tenant_id", "warehouse_id", name="uq_supply_flow_plans_tenant_warehouse"),
    )

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(
        Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_version = Column(Integer, nullable=False, default=1)
    computed_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    #: Orchestration projection only (no inventory / location / recovery copies).
    projection_json = Column(Text, nullable=False, default="{}")
    cta_json = Column(Text, nullable=True)
    next_action_json = Column(Text, nullable=True)
    last_recompute_trigger = Column(String(64), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
