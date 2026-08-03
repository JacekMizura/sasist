"""Read / serialize Living SupplyFlowPlan for HTTP API."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from ...models.supply_flow import SupplyFlowPlan
from .config_service import get_or_create_warehouse_config
from .plan_models import LivingPlanResult, SupplyFlowCta, SupplyFlowNextAction, SupplyFlowPlanProjection


def _loads(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return dict(raw)
    try:
        data = json.loads(raw)
        return dict(data) if isinstance(data, dict) else {}
    except Exception:
        return {}


def _projection_from_dict(raw: dict[str, Any]) -> SupplyFlowPlanProjection:
    return SupplyFlowPlanProjection(
        recommendations=list(raw.get("recommendations") or []),
        delivery_priorities=dict(raw.get("delivery_priorities") or {}),
        operator_queues=dict(raw.get("operator_queues") or {}),
        business_effect=dict(raw.get("business_effect") or {}),
        explainable_decisions=list(raw.get("explainable_decisions") or []),
        execution_plan=dict(raw.get("execution_plan") or {}),
        execution_state=dict(raw.get("execution_state") or {}),
        confidence=dict(raw.get("confidence") or {}),
        rationale=list(raw.get("rationale") or []),
        why_not=list(raw.get("why_not") or []),
        conflicts=list(raw.get("conflicts") or []),
        unload_sequence=list(raw.get("unload_sequence") or []),
        putaway_sequence=list(raw.get("putaway_sequence") or []),
        meta=dict(raw.get("meta") or {}),
    )


def _cta_from_dict(raw: dict[str, Any] | None) -> SupplyFlowCta | None:
    if not raw:
        return None
    return SupplyFlowCta(
        module=raw.get("module"),
        path=raw.get("path"),
        label=raw.get("label"),
        delivery_id=raw.get("delivery_id"),
        extras=dict(raw.get("extras") or {}),
    )


def _next_from_dict(raw: dict[str, Any] | None) -> SupplyFlowNextAction | None:
    if not raw:
        return None
    return SupplyFlowNextAction(
        kind=raw.get("kind"),
        delivery_id=raw.get("delivery_id"),
        line_id=raw.get("line_id"),
        path=raw.get("path"),
        label=raw.get("label"),
        plan_version=raw.get("plan_version"),
        extras=dict(raw.get("extras") or {}),
    )


def load_living_plan(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> LivingPlanResult | None:
    """Load persisted Living plan; None if never recomputed."""
    cfg = get_or_create_warehouse_config(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
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
    projection = _projection_from_dict(_loads(row.projection_json))
    return LivingPlanResult(
        tenant_id=int(row.tenant_id),
        warehouse_id=int(row.warehouse_id),
        plan_version=int(row.plan_version or 1),
        computed_at=row.computed_at,
        optimization_goal=str(cfg.optimization_goal),
        planning_horizon_hours=int(cfg.planning_horizon_hours),
        projection=projection,
        cta=_cta_from_dict(_loads(row.cta_json) or None),
        next_action=_next_from_dict(_loads(row.next_action_json) or None),
        last_recompute_trigger=row.last_recompute_trigger,
    )


def living_plan_to_api_dict(plan: LivingPlanResult | None, *, tenant_id: int, warehouse_id: int, cfg_goal: str, cfg_horizon: int) -> dict[str, Any]:
    if plan is None:
        return {
            "tenant_id": int(tenant_id),
            "warehouse_id": int(warehouse_id),
            "plan_version": 0,
            "computed_at": None,
            "optimization_goal": cfg_goal,
            "planning_horizon_hours": int(cfg_horizon),
            "projection": {},
            "cta": None,
            "next_action": None,
            "last_recompute_trigger": None,
            "has_plan": False,
        }
    return {
        "tenant_id": int(plan.tenant_id),
        "warehouse_id": int(plan.warehouse_id),
        "plan_version": int(plan.plan_version),
        "computed_at": plan.computed_at,
        "optimization_goal": plan.optimization_goal,
        "planning_horizon_hours": int(plan.planning_horizon_hours),
        "projection": plan.projection.to_dict(),
        "cta": plan.cta.to_dict() if plan.cta else None,
        "next_action": plan.next_action.to_dict() if plan.next_action else None,
        "last_recompute_trigger": plan.last_recompute_trigger,
        "has_plan": True,
    }
