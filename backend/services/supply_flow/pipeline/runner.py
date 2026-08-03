"""Decision pipeline runner — wires builders; no business if-ladders here."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from ..constants import (
    SUPPLY_FLOW_PHASE_NA_RAMPIE,
    SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
    SUPPLY_FLOW_PHASE_ROZLADUNEK,
    SUPPLY_FLOW_PHASE_ROZLOKOWANIE,
)
from ..engine_input import SupplyFlowEngineInput
from ..plan_models import SupplyFlowCta, SupplyFlowNextAction, SupplyFlowPlanProjection
from .business_effect_builder import BusinessEffectBuilder
from .candidate_action_builder import CandidateActionBuilder
from .cta_builder import CTABuilder
from .execution_planner import ExecutionPlanner
from .explainable_decision_builder import ExplainableDecisionBuilder
from .priority_resolver import PriorityResolver
from .recommendation_builder import RecommendationBuilder
from ..execution_monitor.monitor import ExecutionMonitor


class DecisionPipeline:
    """
    SupplyFlowEngineInput
      → CandidateActionBuilder
      → PriorityResolver
      → BusinessEffectBuilder
      → CTABuilder
      → RecommendationBuilder
      → ExplainableDecisionBuilder
      → ExecutionPlanner
      → ExecutionMonitor.seed
      → LivingSupplyFlowPlan projection
    """

    def __init__(
        self,
        *,
        candidates: CandidateActionBuilder | None = None,
        priorities: PriorityResolver | None = None,
        effects: BusinessEffectBuilder | None = None,
        ctas: CTABuilder | None = None,
        recommendations: RecommendationBuilder | None = None,
        explainable: ExplainableDecisionBuilder | None = None,
        execution: ExecutionPlanner | None = None,
        execution_monitor: ExecutionMonitor | None = None,
    ) -> None:
        self.candidates = candidates or CandidateActionBuilder()
        self.priorities = priorities or PriorityResolver()
        self.effects = effects or BusinessEffectBuilder()
        self.ctas = ctas or CTABuilder()
        self.recommendations = recommendations or RecommendationBuilder()
        self.explainable = explainable or ExplainableDecisionBuilder()
        self.execution = execution or ExecutionPlanner()
        self.execution_monitor = execution_monitor or ExecutionMonitor()

    def run(
        self,
        inp: SupplyFlowEngineInput,
        *,
        now: datetime | None = None,
        focus_delivery_id: int | None = None,
        focus_pz_id: int | None = None,
    ) -> tuple[SupplyFlowPlanProjection, SupplyFlowCta | None, SupplyFlowNextAction | None, int | None]:
        candidate_list = self.candidates.build(inp)
        priority_res = self.priorities.resolve(inp, candidate_list, now=now)
        business_effect = self.effects.build(inp, candidate_list, priorities=priority_res)
        cta_res = self.ctas.build(
            inp,
            priority_res,
            focus_delivery_id=focus_delivery_id,
            focus_pz_id=focus_pz_id,
        )
        recommendations = self.recommendations.build(priority_res.ranked_actions)
        explanations = self.explainable.build_dicts(
            recommendations,
            priority_res,
            business_effect,
        )
        for rec, expl in zip(recommendations, explanations):
            rec["explanation"] = expl

        execution_plan = self.execution.plan_dict(recommendations)
        # CP4: seed ExecutionState overlay (plan contract untouched).
        execution_state = self.execution_monitor.seed_dict(execution_plan)

        putaway_seq = [
            {"delivery_id": int(d.id), "pz_ids": inp.pz_ids_for_delivery(int(d.id))}
            for d in inp.active_deliveries()
            if str(d.operational_phase)
            in (SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA, SUPPLY_FLOW_PHASE_ROZLOKOWANIE)
        ]
        unload_seq = [
            {"delivery_id": int(d.id)}
            for d in inp.active_deliveries()
            if str(d.operational_phase) in (SUPPLY_FLOW_PHASE_NA_RAMPIE, SUPPLY_FLOW_PHASE_ROZLADUNEK)
        ]

        projection = SupplyFlowPlanProjection(
            recommendations=recommendations,
            delivery_priorities=priority_res.delivery_priorities,
            operator_queues={},
            business_effect=business_effect,
            explainable_decisions=explanations,
            execution_plan=execution_plan,
            execution_state=execution_state,
            confidence={},
            rationale=[
                "Capability Pack 1: dynamic PriorityResolver + decision pipeline.",
                "Capability Pack 2: ExplainableDecision projection (no new scoring).",
                "Capability Pack 3: ExecutionPlanner orders Recommendations (no new decisions).",
                "Capability Pack 4: ExecutionMonitor tracks ExecutionState from WMS events.",
            ],
            why_not=[],
            conflicts=[],
            unload_sequence=unload_seq,
            putaway_sequence=putaway_seq,
            meta={
                "stage": "v1_pipeline",
                "algorithms": "capability_pack_4_execution_monitor",
                "capability_packs": [
                    "dynamic_delivery_priority",
                    "explainable_decision",
                    "execution_planner",
                    "execution_monitor",
                ],
                "pipeline": [
                    "CandidateActionBuilder",
                    "PriorityResolver",
                    "BusinessEffectBuilder",
                    "CTABuilder",
                    "RecommendationBuilder",
                    "ExplainableDecisionBuilder",
                    "ExecutionPlanner",
                    "ExecutionMonitor.seed",
                ],
                "active_deliveries": [r for r in priority_res.active_delivery_rows if r["active"]],
                "all_deliveries": priority_res.active_delivery_rows,
                "execution_order": priority_res.execution_order,
                "open_pz_awaiting_putaway": [
                    {
                        "pz_id": p.id,
                        "delivery_id": p.delivery_id,
                        "putaway_status": p.putaway_status,
                    }
                    for p in inp.open_pz_awaiting_putaway
                ],
                "reads": {
                    "recovery": {
                        "open_issue_task_count": inp.recovery.get("open_issue_task_count"),
                        "open_operational_task_count": inp.recovery.get(
                            "open_operational_task_count"
                        ),
                    },
                    "capacity": {
                        "location_count": inp.capacity.get("location_count"),
                        "dock_location_count": inp.capacity.get("dock_location_count"),
                        "dock_has_capacity_hint": inp.capacity.get("dock_has_capacity_hint"),
                    },
                    "slotting": {
                        "slotted_product_count": inp.slotting.get("slotted_product_count"),
                    },
                    "inventory": {
                        "row_count": inp.inventory.get("row_count"),
                        "total_qty": inp.inventory.get("total_qty"),
                    },
                },
                "goal": inp.optimization_goal,
                "horizon_h": inp.planning_horizon_hours,
            },
        )
        return projection, cta_res.cta, cta_res.next_action, cta_res.focus_delivery_id


def describe_pipeline() -> dict[str, Any]:
    return {
        "flow": [
            "SupplyFlowEngineInput",
            "CandidateActionBuilder",
            "PriorityResolver",
            "BusinessEffectBuilder",
            "CTABuilder",
            "RecommendationBuilder",
            "ExplainableDecisionBuilder",
            "ExecutionPlanner",
            "ExecutionMonitor",
            "LivingSupplyFlowPlan",
        ],
        "recommendation_answers": "what_is_worth_doing",
        "execution_plan_answers": "what_exactly_and_in_what_order",
        "execution_state_answers": "what_is_the_runtime_status_of_each_step",
        "recommendation_is_terminal": True,
        "recommendation_hosts_business_logic": False,
        "explainable_is_projection_only": True,
        "explainable_recalculates_priority": False,
        "execution_planner_is_projection_only": True,
        "execution_planner_changes_priorities": False,
        "execution_planner_invents_recommendations": False,
        "execution_monitor_is_projection_only": True,
        "execution_monitor_mutates_execution_plan": False,
        "execution_monitor_changes_priorities": False,
        "execution_monitor_changes_recommendations": False,
    }
