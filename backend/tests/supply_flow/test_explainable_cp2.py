"""Capability Pack 2 — ExplainableDecision projection."""

from __future__ import annotations

from datetime import datetime

from backend.services.supply_flow.constants import SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA
from backend.services.supply_flow.pipeline import DecisionPipeline, describe_pipeline
from backend.services.supply_flow.pipeline.explainable_decision_builder import (
    ExplainableDecisionBuilder,
)
from backend.services.supply_flow.pipeline.models import PriorityResolution
from backend.services.supply_flow.pipeline.priority_resolver import (
    DeliveryPriorityFactors,
    compute_delivery_priority_from_factors,
)
from backend.services.supply_flow.pipeline.recommendation_builder import RecommendationBuilder
from backend.services.supply_flow.pipeline.models import CandidateAction, RankedAction


def test_pipeline_includes_explainable_stage():
    info = describe_pipeline()
    assert "ExplainableDecisionBuilder" in info["flow"]
    assert info["explainable_is_projection_only"] is True
    assert info["explainable_recalculates_priority"] is False


def test_explainable_uses_priority_contribution_reasons():
    now = datetime.utcnow()
    total, parts = compute_delivery_priority_from_factors(
        DeliveryPriorityFactors(
            phase=SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
            expected_date=None,
            phase_changed_at=now,
            open_pz_count=2,
            unlockable_order_count=1,
            recovery_open_warehouse=True,
            recovery_ops_count=2,
            avg_utilization_percent=80.0,
            slotted_product_overlap=2,
            slotted_warehouse_count=10,
            item_count=4,
            now=now,
        )
    )
    # Simulate PriorityResolver row (already-computed contributions projected for CP2).
    from backend.services.supply_flow.pipeline.priority import aggregate_priority

    _, _, contributions = aggregate_priority(
        DeliveryPriorityFactors(
            phase=SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
            expected_date=None,
            phase_changed_at=now,
            open_pz_count=2,
            unlockable_order_count=1,
            recovery_open_warehouse=True,
            recovery_ops_count=2,
            avg_utilization_percent=80.0,
            slotted_product_overlap=2,
            slotted_warehouse_count=10,
            item_count=4,
            now=now,
        )
    )
    assert abs(total - sum(parts.values())) < 0.01 or total == round(sum(parts.values()), 2)

    row = {
        "delivery_id": 7,
        "operational_phase": SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
        "expected_date": None,
        "item_count": 4,
        "priority": total,
        "priority_factors": parts,
        "priority_contributions": [
            {
                "score": float(c.score),
                "reason": str(c.reason),
                "weight": float(c.weight),
                "source": str(c.source),
            }
            for c in contributions
        ],
        "open_pz_count": 2,
        "unlockable_order_count": 1,
        "slotted_product_overlap": 2,
        "slotted_warehouse_count": 10,
        "recovery_open_warehouse": True,
        "recovery_ops_count": 2,
        "avg_utilization_percent": 80.0,
    }
    rec = {
        "action": "START_PUTAWAY",
        "label": "Rozpocznij rozlokowanie",
        "module": "putaway",
        "delivery_id": 7,
        "pz_id": 3,
        "phase": SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
        "priority": total,
    }
    priorities = PriorityResolution(
        delivery_priorities={"7": total},
        ranked_actions=[],
        execution_order=[{"seq": 1, "delivery_id": 7, "phase": SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA, "priority": total}],
        active_delivery_rows=[row],
    )
    effect = {
        "summary": "możliwe odblokowanie zamówień Recovery po rozlokowaniu (szacunek: 1)",
        "notes": ["możliwe odblokowanie zamówień Recovery po rozlokowaniu (szacunek: 1)"],
        "unlockable_order_estimate": 1,
        "top_priority_delivery_id": 7,
        "top_priority_value": total,
        "source": "PriorityResolver",
        "quantitative": False,
    }
    decisions = ExplainableDecisionBuilder().build([rec], priorities, effect)
    assert len(decisions) == 1
    d = decisions[0]
    assert d.decision["action"] == "START_PUTAWAY"
    assert d.delivery_id == 7
    assert len(d.top_policies) >= 1
    assert d.top_policies[0]["score"] >= d.top_policies[-1]["score"]
    assert any(t.get("reason") for t in d.top_policies)
    assert any(t["reason"] in d.why for t in d.top_policies if t.get("reason"))
    assert d.inputs_used.get("open_pz_count") == 2
    assert d.business_effect.get("is_top_priority_delivery") is True
    assert d.meta.get("projection_only") is True


def test_explainable_does_not_change_recommendation_core_fields():
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
    core_before = [{k: v for k, v in r.items()} for r in recs]
    explanations = ExplainableDecisionBuilder().build_dicts(
        recs,
        PriorityResolution(
            delivery_priorities={"7": 120.0},
            ranked_actions=ranked,
            execution_order=[],
            active_delivery_rows=[
                {
                    "delivery_id": 7,
                    "priority": 120.0,
                    "priority_factors": {"phase": 100.0},
                    "priority_contributions": [
                        {
                            "score": 100.0,
                            "reason": "Faza operacyjna OCZEKUJE_ROZLOKOWANIA",
                            "weight": 1.0,
                            "source": "phase",
                        }
                    ],
                    "operational_phase": "OCZEKUJE_ROZLOKOWANIA",
                    "open_pz_count": 0,
                    "unlockable_order_count": 0,
                    "item_count": 1,
                    "expected_date": None,
                    "slotted_product_overlap": 0,
                    "slotted_warehouse_count": 0,
                    "recovery_open_warehouse": False,
                    "recovery_ops_count": 0,
                    "avg_utilization_percent": 0.0,
                }
            ],
        ),
        {"summary": "brak wpływu", "source": "PriorityResolver"},
    )
    assert len(explanations) == 1
    # RecommendationBuilder output untouched until runner attaches explanation.
    assert recs == core_before
    assert DecisionPipeline() is not None
