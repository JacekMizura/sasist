"""Warehouse Supply Flow configuration — SSOT for goal / horizon (not the living plan)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from ...models.supply_flow import SupplyFlowWarehouseConfig
from .constants import (
    DEFAULT_OPTIMIZATION_GOAL,
    DEFAULT_PLANNING_HORIZON_HOURS,
    SUPPLY_FLOW_OPTIMIZATION_GOALS,
)


class SupplyFlowConfigError(ValueError):
    pass


def get_or_create_warehouse_config(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> SupplyFlowWarehouseConfig:
    row = (
        db.query(SupplyFlowWarehouseConfig)
        .filter(
            SupplyFlowWarehouseConfig.tenant_id == int(tenant_id),
            SupplyFlowWarehouseConfig.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if row is not None:
        return row
    now = datetime.utcnow()
    row = SupplyFlowWarehouseConfig(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        optimization_goal=DEFAULT_OPTIMIZATION_GOAL,
        planning_horizon_hours=DEFAULT_PLANNING_HORIZON_HOURS,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.flush()
    return row


def update_warehouse_config(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    optimization_goal: str | None = None,
    planning_horizon_hours: int | None = None,
) -> SupplyFlowWarehouseConfig:
    row = get_or_create_warehouse_config(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    if optimization_goal is not None:
        goal = optimization_goal.strip().upper()
        if goal not in SUPPLY_FLOW_OPTIMIZATION_GOALS:
            raise SupplyFlowConfigError(f"Nieznany optimization_goal: {optimization_goal!r}")
        row.optimization_goal = goal
    if planning_horizon_hours is not None:
        h = int(planning_horizon_hours)
        if h < 1 or h > 24 * 30:
            raise SupplyFlowConfigError(f"Nieprawidłowy planning_horizon_hours: {h}")
        row.planning_horizon_hours = h
    row.updated_at = datetime.utcnow()
    db.flush()
    return row
