"""Persist ExecutionState onto Living plan projection (overlay only)."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ....models.supply_flow import SupplyFlowPlan
from ..plan_models import LivingPlanResult
from .event_mapping import MONITOR_EVENT_TYPES
from .monitor import ExecutionMonitor
from .state import ExecutionState

logger = logging.getLogger(__name__)


def sync_execution_state_for_warehouse(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    events: list[Any],
    plan: LivingPlanResult | None = None,
    now: datetime | None = None,
) -> dict[str, Any] | None:
    """
    Seed / update ExecutionState from WMS events without mutating ExecutionPlan.

    Called by the dispatcher after lifecycle (+ optional recompute).
    """
    monitor_events = [
        e for e in events if getattr(e, "event_type", None) in MONITOR_EVENT_TYPES
    ]
    row = (
        db.query(SupplyFlowPlan)
        .filter(
            SupplyFlowPlan.tenant_id == int(tenant_id),
            SupplyFlowPlan.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if row is None:
        return None

    projection = _load_projection(row)
    execution_plan = dict(projection.get("execution_plan") or {})
    if not execution_plan.get("steps"):
        # Prefer freshly recomputed plan when available.
        if plan is not None and plan.projection.execution_plan:
            execution_plan = dict(plan.projection.execution_plan)
            projection["execution_plan"] = execution_plan

    if not execution_plan.get("steps"):
        return None

    previous = ExecutionState.from_dict(projection.get("execution_state"))
    monitor = ExecutionMonitor()
    state = monitor.seed_from_plan(
        execution_plan,
        plan_version=int(row.plan_version) if row.plan_version is not None else None,
        previous=previous,
        now=now,
    )
    if monitor_events:
        state = monitor.apply_events(state, execution_plan, monitor_events, now=now)

    state_dict = state.to_dict()
    projection["execution_state"] = state_dict
    row.projection_json = json.dumps(projection, ensure_ascii=False, default=str)
    row.updated_at = now or datetime.utcnow()
    db.flush()

    if plan is not None:
        plan.projection.execution_state = state_dict

    logger.info(
        "supply_flow.execution_monitor synced tenant=%s warehouse=%s status=%s events=%s",
        tenant_id,
        warehouse_id,
        state.status,
        [getattr(e, "event_type", None) for e in monitor_events],
    )
    return state_dict


def _load_projection(row: SupplyFlowPlan) -> dict[str, Any]:
    raw = row.projection_json
    if not raw:
        return {}
    if isinstance(raw, dict):
        return dict(raw)
    try:
        return dict(json.loads(raw))
    except Exception:
        return {}
