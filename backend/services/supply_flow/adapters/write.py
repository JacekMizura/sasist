"""WRITE adapter — only operational phase, Living SupplyFlowPlan, CTA, next action."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ....models.inbound_delivery import InboundDelivery
from ....models.supply_flow import SupplyFlowPlan
from ..constants import PHASE_HISTORY_SOURCE_SYSTEM
from ..lifecycle import set_operational_phase
from ..plan_models import LivingPlanResult, SupplyFlowCta, SupplyFlowNextAction, SupplyFlowPlanProjection


def _dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, default=str)


class SupplyFlowWriteAdapter:
    """Narrow writes — never inventory, locations, recovery, slotting, or config-as-plan."""

    def write_operational_phase(
        self,
        db: Session,
        *,
        delivery: InboundDelivery,
        to_phase: str,
        user_id: int | None = None,
        source: str = PHASE_HISTORY_SOURCE_SYSTEM,
        comment: str | None = None,
        is_automatic: bool = True,
        force: bool = False,
    ):
        return set_operational_phase(
            db,
            delivery=delivery,
            to_phase=to_phase,
            user_id=user_id,
            source=source,
            comment=comment,
            is_automatic=is_automatic,
            force=force,
        )

    def upsert_living_plan(
        self,
        db: Session,
        *,
        tenant_id: int,
        warehouse_id: int,
        projection: SupplyFlowPlanProjection,
        optimization_goal: str,
        planning_horizon_hours: int,
        cta: SupplyFlowCta | None = None,
        next_action: SupplyFlowNextAction | None = None,
        recompute_trigger: str | None = None,
        now: datetime | None = None,
    ) -> LivingPlanResult:
        """
        Persist orchestration result only.

        ``optimization_goal`` / ``planning_horizon_hours`` are recorded in the
        returned LivingPlanResult (and projection meta) as the config *used* for
        this compute — they are not stored as plan configuration columns.
        """
        ts = now or datetime.utcnow()
        # Echo config used into meta for audit of this compute (not config ownership).
        projection.meta = {
            **(projection.meta or {}),
            "config_used": {
                "optimization_goal": optimization_goal,
                "planning_horizon_hours": int(planning_horizon_hours),
            },
        }
        row = (
            db.query(SupplyFlowPlan)
            .filter(
                SupplyFlowPlan.tenant_id == int(tenant_id),
                SupplyFlowPlan.warehouse_id == int(warehouse_id),
            )
            .first()
        )
        if row is None:
            row = SupplyFlowPlan(
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                plan_version=1,
                computed_at=ts,
                projection_json=_dumps(projection.to_dict()),
                cta_json=_dumps(cta.to_dict()) if cta else None,
                next_action_json=_dumps(next_action.to_dict()) if next_action else None,
                last_recompute_trigger=recompute_trigger,
                created_at=ts,
                updated_at=ts,
            )
            db.add(row)
        else:
            row.plan_version = int(row.plan_version or 0) + 1
            row.computed_at = ts
            row.projection_json = _dumps(projection.to_dict())
            row.cta_json = _dumps(cta.to_dict()) if cta else None
            row.next_action_json = _dumps(next_action.to_dict()) if next_action else None
            row.last_recompute_trigger = recompute_trigger
            row.updated_at = ts
        db.flush()
        return LivingPlanResult(
            tenant_id=int(row.tenant_id),
            warehouse_id=int(row.warehouse_id),
            plan_version=int(row.plan_version),
            computed_at=row.computed_at,
            optimization_goal=optimization_goal,
            planning_horizon_hours=int(planning_horizon_hours),
            projection=projection,
            cta=cta,
            next_action=next_action,
            last_recompute_trigger=recompute_trigger,
        )

    def write_cta(self, db: Session, *, tenant_id: int, warehouse_id: int, cta: SupplyFlowCta) -> None:
        row = self._get_plan(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
        if row is None:
            raise ValueError("Brak Living SupplyFlowPlan — najpierw recompute.")
        row.cta_json = _dumps(cta.to_dict())
        row.updated_at = datetime.utcnow()
        db.flush()

    def write_next_action(
        self, db: Session, *, tenant_id: int, warehouse_id: int, next_action: SupplyFlowNextAction
    ) -> None:
        row = self._get_plan(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
        if row is None:
            raise ValueError("Brak Living SupplyFlowPlan — najpierw recompute.")
        next_action.plan_version = int(row.plan_version)
        row.next_action_json = _dumps(next_action.to_dict())
        row.updated_at = datetime.utcnow()
        db.flush()

    def _get_plan(self, db: Session, *, tenant_id: int, warehouse_id: int) -> SupplyFlowPlan | None:
        return (
            db.query(SupplyFlowPlan)
            .filter(
                SupplyFlowPlan.tenant_id == int(tenant_id),
                SupplyFlowPlan.warehouse_id == int(warehouse_id),
            )
            .first()
        )
