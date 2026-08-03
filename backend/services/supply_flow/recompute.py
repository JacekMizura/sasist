"""Recompute architecture — trigger registry + entrypoint (algorithms later)."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy.orm import Session

from .constants import (
    RECOMPUTE_CAPACITY_CHANGED,
    RECOMPUTE_CONFIG_CHANGED,
    RECOMPUTE_CROSS_DOCK_FREED,
    RECOMPUTE_ETA_CHANGED,
    RECOMPUTE_MANUAL,
    RECOMPUTE_NEW_DELIVERY,
    RECOMPUTE_NEW_ORDER,
    RECOMPUTE_OPERATOR_SHIFT_ENDED,
    RECOMPUTE_ORDER_CANCELLED,
    RECOMPUTE_PHASE_CHANGED,
    RECOMPUTE_PUTAWAY_FINISHED,
    RECOMPUTE_UNLOAD_FINISHED,
    SUPPLY_FLOW_RECOMPUTE_TRIGGERS,
)
from .engine import SupplyFlowEngine, SupplyFlowEngineContext
from .plan_models import LivingPlanResult

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RecomputeRequest:
    tenant_id: int
    warehouse_id: int
    trigger: str
    delivery_id: int | None = None
    order_id: int | None = None


def assert_known_trigger(trigger: str) -> str:
    t = (trigger or "").strip().upper()
    if t not in SUPPLY_FLOW_RECOMPUTE_TRIGGERS:
        raise ValueError(f"Nieznany trigger recompute Supply Flow: {trigger!r}")
    return t


def request_recompute(
    db: Session, req: RecomputeRequest, *, engine: SupplyFlowEngine | None = None
) -> LivingPlanResult:
    """
    Recompute Living SupplyFlowPlan for a warehouse.

    Reads SupplyFlowWarehouseConfig (goal/horizon), then regenerates plan.
    """
    trigger = assert_known_trigger(req.trigger)
    eng = engine or SupplyFlowEngine()
    ctx = SupplyFlowEngineContext(
        tenant_id=int(req.tenant_id),
        warehouse_id=int(req.warehouse_id),
        recompute_trigger=trigger,
        focus_delivery_id=req.delivery_id,
    )
    logger.info(
        "supply_flow.recompute trigger=%s tenant=%s warehouse=%s delivery=%s order=%s",
        trigger,
        req.tenant_id,
        req.warehouse_id,
        req.delivery_id,
        req.order_id,
    )
    return eng.compute_living_plan(db, ctx)


RECOMPUTE_HOOK_TODOS: dict[str, str] = {
    RECOMPUTE_NEW_ORDER: "publish EVENT_ORDER_CREATED (not wired to order create yet)",
    RECOMPUTE_ORDER_CANCELLED: "publish EVENT_ORDER_CANCELLED (not wired yet)",
    RECOMPUTE_NEW_DELIVERY: "wired: delivery.create → publish NEW_DELIVERY → Dispatcher",
    RECOMPUTE_PHASE_CHANGED: "wired: delivery.update → publish DELIVERY_PHASE_CHANGED",
    RECOMPUTE_UNLOAD_FINISHED: "wired: finish_wms_receiving_pz → publish UNLOAD_FINISHED",
    RECOMPUTE_PUTAWAY_FINISHED: "wired: finalize_wms_relocation_pz → publish PUTAWAY_FINISHED",
    RECOMPUTE_CAPACITY_CHANGED: "publish EVENT_CAPACITY_CHANGED (not wired yet)",
    RECOMPUTE_CROSS_DOCK_FREED: "publish EVENT_CROSS_DOCK_FREED (not wired yet)",
    RECOMPUTE_OPERATOR_SHIFT_ENDED: "publish EVENT_OPERATOR_FINISHED (not wired yet)",
    RECOMPUTE_ETA_CHANGED: "wired: delivery.update expected_date → publish ETA_CHANGED",
    RECOMPUTE_CONFIG_CHANGED: "publish EVENT_CONFIG_CHANGED after config update (TODO)",
    RECOMPUTE_MANUAL: "publish EVENT_MANUAL_RECOMPUTE / request_recompute via Dispatcher only",
}
