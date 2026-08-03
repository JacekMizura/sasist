"""ETAP 3C — decision pipeline structure (builders, no new algorithms)."""

from __future__ import annotations

from backend.services.supply_flow.pipeline import DecisionPipeline, describe_pipeline
from backend.services.supply_flow.pipeline.models import CandidateAction, RankedAction
from backend.services.supply_flow.pipeline.recommendation_builder import RecommendationBuilder


def test_pipeline_stages_order():
    info = describe_pipeline()
    assert info["flow"] == [
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
    ]
    assert info["recommendation_is_terminal"] is True
    assert info["recommendation_hosts_business_logic"] is False
    assert info["explainable_is_projection_only"] is True
    assert info["execution_planner_is_projection_only"] is True
    assert info["execution_monitor_is_projection_only"] is True
    assert info["execution_monitor_mutates_execution_plan"] is False


def test_recommendation_builder_is_pure_projection():
    """RecommendationBuilder only packages ranked actions — no action invention."""
    ranked = [
        RankedAction(
            candidate=CandidateAction(
                action="START_PUTAWAY",
                label="Rozpocznij rozlokowanie",
                module="putaway",
                delivery_id=7,
                pz_id=3,
                phase="OCZEKUJE_ROZLOKOWANIA",
            ),
            priority=120.0,
        )
    ]
    recs = RecommendationBuilder().build(ranked)
    assert len(recs) == 1
    assert recs[0]["action"] == "START_PUTAWAY"
    assert recs[0]["priority"] == 120.0
    assert recs[0]["delivery_id"] == 7


def test_decision_pipeline_constructs():
    assert DecisionPipeline() is not None
