"""Backend Automation Engine — persistent rules, executions, status-transition events."""

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
    Index,
)
from sqlalchemy.orm import relationship

from ..database import Base


class StatusTransitionEvent(Base):
    """Immutable identity for one status-enter event (idempotency root)."""

    __tablename__ = "status_transition_events"

    id = Column(String(36), primary_key=True)  # UUID
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=True, index=True)
    entity_type = Column(String(32), nullable=False, index=True)  # ORDER | RETURN | COMPLAINT
    entity_id = Column(Integer, nullable=False, index=True)
    old_status_key = Column(String(64), nullable=True)
    new_status_key = Column(String(64), nullable=False)
    actor_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    root_event_id = Column(String(36), nullable=True, index=True)  # root of automation chain
    depth = Column(Integer, nullable=False, default=0)
    occurred_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class AutomationRule(Base):
    __tablename__ = "automation_rules"
    __table_args__ = (
        Index("ix_automation_rules_tenant_entity", "tenant_id", "entity_type", "enabled"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=True, index=True)
    entity_type = Column(String(32), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    enabled = Column(Boolean, nullable=False, default=True)
    trigger_type = Column(String(64), nullable=False, default="entity_status_entered")
    trigger_config_json = Column(Text, nullable=False, default="{}")
    #: USER | SYSTEM | STATUS_ACTION — source of rule authorship
    source = Column(String(32), nullable=False, default="USER")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    effects = relationship(
        "AutomationEffect",
        back_populates="rule",
        cascade="all, delete-orphan",
        order_by="AutomationEffect.position",
    )


class AutomationEffect(Base):
    __tablename__ = "automation_effects"
    __table_args__ = (
        UniqueConstraint("rule_id", "position", name="uq_automation_effect_rule_position"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_id = Column(Integer, ForeignKey("automation_rules.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, nullable=False, default=0)
    effect_type = Column(String(64), nullable=False)
    config_json = Column(Text, nullable=False, default="{}")
    enabled = Column(Boolean, nullable=False, default=True)

    rule = relationship("AutomationRule", back_populates="effects")


class AutomationExecution(Base):
    __tablename__ = "automation_executions"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_automation_execution_idempotency"),
        Index("ix_automation_exec_entity", "entity_type", "entity_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_id = Column(Integer, ForeignKey("automation_rules.id", ondelete="CASCADE"), nullable=False, index=True)
    entity_type = Column(String(32), nullable=False)
    entity_id = Column(Integer, nullable=False)
    trigger_event_id = Column(String(36), ForeignKey("status_transition_events.id", ondelete="CASCADE"), nullable=False)
    idempotency_key = Column(String(191), nullable=False)
    status = Column(String(24), nullable=False, default="PENDING")  # PENDING|RUNNING|SUCCEEDED|FAILED|SKIPPED
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    effect_executions = relationship(
        "AutomationEffectExecution",
        back_populates="execution",
        cascade="all, delete-orphan",
        order_by="AutomationEffectExecution.id",
    )


class AutomationEffectExecution(Base):
    __tablename__ = "automation_effect_executions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    execution_id = Column(
        Integer, ForeignKey("automation_executions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    effect_id = Column(Integer, ForeignKey("automation_effects.id", ondelete="SET NULL"), nullable=True)
    position = Column(Integer, nullable=False, default=0)
    effect_type = Column(String(64), nullable=False)
    status = Column(String(24), nullable=False, default="PENDING")
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    error = Column(Text, nullable=True)
    result_json = Column(Text, nullable=True)

    execution = relationship("AutomationExecution", back_populates="effect_executions")
