"""Supply Flow Engine — orchestration via decision pipeline (ETAP 3C)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from .adapters.read import SupplyFlowReadBundle, build_default_read_bundle
from .adapters.write import SupplyFlowWriteAdapter
from .config_service import get_or_create_warehouse_config
from .engine_input import OpenPzRead, SupplyFlowEngineInput
from .pipeline import DecisionPipeline
from .plan_models import LivingPlanResult


@dataclass
class SupplyFlowEngineContext:
    tenant_id: int
    warehouse_id: int
    recompute_trigger: str | None = None
    focus_delivery_id: int | None = None
    focus_pz_id: int | None = None


class SupplyFlowEngine:
    """
    Orchestration only.

    gather_input (READ adapters) → DecisionPipeline → LivingSupplyFlowPlan.
    Never owns inventory / locations / recovery / slotting.
    """

    def __init__(
        self,
        *,
        reads: SupplyFlowReadBundle | None = None,
        writes: SupplyFlowWriteAdapter | None = None,
        pipeline: DecisionPipeline | None = None,
    ) -> None:
        self.reads = reads or build_default_read_bundle()
        self.writes = writes or SupplyFlowWriteAdapter()
        self.pipeline = pipeline or DecisionPipeline()

    def gather_input(self, db: Session, ctx: SupplyFlowEngineContext) -> SupplyFlowEngineInput:
        config = get_or_create_warehouse_config(
            db, tenant_id=ctx.tenant_id, warehouse_id=ctx.warehouse_id
        )
        putaway = self.reads.putaway.warehouse_summary(
            db, tenant_id=ctx.tenant_id, warehouse_id=ctx.warehouse_id
        )
        open_pz = [
            OpenPzRead(
                id=int(p["id"]),
                delivery_id=int(p["delivery_id"]) if p.get("delivery_id") is not None else None,
                receiving_status=str(p.get("receiving_status") or ""),
                putaway_status=str(p.get("putaway_status") or ""),
            )
            for p in (putaway.get("open_pz") or [])
        ]
        return SupplyFlowEngineInput(
            tenant_id=int(ctx.tenant_id),
            warehouse_id=int(ctx.warehouse_id),
            deliveries=self.reads.deliveries.list_for_warehouse(
                db, tenant_id=ctx.tenant_id, warehouse_id=ctx.warehouse_id
            ),
            open_pz_awaiting_putaway=open_pz,
            putaway_summary=putaway,
            recovery=self.reads.recovery.warehouse_summary(
                db, tenant_id=ctx.tenant_id, warehouse_id=ctx.warehouse_id
            ),
            capacity=self.reads.fit_capacity.warehouse_summary(
                db, tenant_id=ctx.tenant_id, warehouse_id=ctx.warehouse_id
            ),
            slotting=self.reads.slotting.warehouse_summary(
                db, tenant_id=ctx.tenant_id, warehouse_id=ctx.warehouse_id
            ),
            inventory=self.reads.inventory.warehouse_summary(
                db, tenant_id=ctx.tenant_id, warehouse_id=ctx.warehouse_id
            ),
            warehouse_graph=self.reads.warehouse_graph.warehouse_summary(
                db, tenant_id=ctx.tenant_id, warehouse_id=ctx.warehouse_id
            ),
            wms_terminal=self.reads.wms_terminal.warehouse_summary(
                db, tenant_id=ctx.tenant_id, warehouse_id=ctx.warehouse_id
            ),
            optimization_goal=str(config.optimization_goal),
            planning_horizon_hours=int(config.planning_horizon_hours),
        )

    def compute_living_plan(self, db: Session, ctx: SupplyFlowEngineContext) -> LivingPlanResult:
        inp = self.gather_input(db, ctx)
        projection, cta, next_action, _focus = self.pipeline.run(
            inp,
            focus_delivery_id=ctx.focus_delivery_id,
            focus_pz_id=ctx.focus_pz_id,
        )

        result = self.writes.upsert_living_plan(
            db,
            tenant_id=ctx.tenant_id,
            warehouse_id=ctx.warehouse_id,
            projection=projection,
            optimization_goal=inp.optimization_goal,
            planning_horizon_hours=inp.planning_horizon_hours,
            cta=cta,
            next_action=next_action,
            recompute_trigger=ctx.recompute_trigger,
            now=datetime.utcnow(),
        )
        if result.next_action is not None:
            result.next_action.plan_version = result.plan_version
        return result
