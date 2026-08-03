"""Capability Pack 3 — ExecutionPlanner projection."""

from __future__ import annotations

from backend.services.supply_flow.pipeline import describe_pipeline
from backend.services.supply_flow.pipeline.execution_plan import EXECUTION_STATUS_PLANNED
from backend.services.supply_flow.pipeline.execution_planner import ExecutionPlanner


def test_pipeline_includes_execution_planner():
    info = describe_pipeline()
    assert "ExecutionPlanner" in info["flow"]
    assert "ExecutionMonitor" in info["flow"]
    assert info["flow"][-1] == "LivingSupplyFlowPlan"
    assert info["execution_planner_is_projection_only"] is True
    assert info["execution_planner_changes_priorities"] is False
    assert info["execution_planner_invents_recommendations"] is False
    assert info["recommendation_answers"] == "what_is_worth_doing"
    assert info["execution_plan_answers"] == "what_exactly_and_in_what_order"


def test_execution_planner_preserves_recommendation_order_and_links():
    recs = [
        {
            "action": "START_PUTAWAY",
            "label": "Rozpocznij rozlokowanie",
            "module": "putaway",
            "delivery_id": 7,
            "pz_id": 3,
            "phase": "OCZEKUJE_ROZLOKOWANIA",
            "priority": 150.0,
        },
        {
            "action": "START_UNLOAD",
            "label": "Rozpocznij rozładunek",
            "module": "receiving",
            "delivery_id": 2,
            "pz_id": None,
            "phase": "NA_RAMPIE",
            "priority": 90.0,
        },
        {
            "action": "CONTINUE_PUTAWAY",
            "label": "Kontynuuj rozlokowanie",
            "module": "putaway",
            "delivery_id": 7,
            "pz_id": 4,
            "phase": "ROZLOKOWANIE",
            "priority": 80.0,
        },
    ]
    plan = ExecutionPlanner().plan(recs)
    assert plan.status == EXECUTION_STATUS_PLANNED
    assert plan.step_count == 3
    assert [s.seq for s in plan.steps] == [1, 2, 3]
    assert [s.recommendation_index for s in plan.steps] == [0, 1, 2]
    assert [s.priority for s in plan.steps] == [150.0, 90.0, 80.0]
    assert all(s.status == EXECUTION_STATUS_PLANNED for s in plan.steps)
    assert plan.steps[0].goal == "Rozlokowanie dostawy"
    assert plan.steps[0].recommendation_ref["action"] == "START_PUTAWAY"
    assert plan.steps[0].recommendation_ref["recommendation_index"] == 0

    # Grouping by delivery preserves first-seen delivery order from recommendation list.
    assert [g["delivery_id"] for g in plan.delivery_groups] == [7, 2]
    assert plan.delivery_groups[0]["step_seqs"] == [1, 3]
    assert plan.delivery_groups[1]["step_seqs"] == [2]
    assert plan.meta["preserves_recommendation_order"] is True
    assert plan.meta["changes_priorities"] is False
    assert plan.meta["invents_recommendations"] is False


def test_execution_planner_does_not_invent_or_reorder_by_priority():
    """Even if priorities are descending-wrong, planner keeps Recommendation list order."""
    recs = [
        {"action": "A", "label": "Low first", "module": "x", "delivery_id": 1, "priority": 10.0},
        {"action": "B", "label": "High second", "module": "x", "delivery_id": 1, "priority": 99.0},
    ]
    plan = ExecutionPlanner().plan(recs)
    assert [s.action for s in plan.steps] == ["A", "B"]
    assert [s.priority for s in plan.steps] == [10.0, 99.0]
    assert len(plan.steps) == len(recs)
