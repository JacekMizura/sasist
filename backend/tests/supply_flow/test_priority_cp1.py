"""Capability Pack 1 — dynamic PriorityResolver."""

from __future__ import annotations

from datetime import datetime

from backend.services.supply_flow.constants import (
    SUPPLY_FLOW_PHASE_AWIZOWANA,
    SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
)
from backend.services.supply_flow.pipeline.priority_resolver import (
    DeliveryPriorityFactors,
    compute_delivery_priority,
    compute_delivery_priority_from_factors,
)
from backend.services.supply_flow.pipeline.business_effect_builder import BusinessEffectBuilder
from backend.services.supply_flow.pipeline.models import PriorityResolution
from backend.services.supply_flow.engine_input import SupplyFlowEngineInput


def test_unlockable_orders_raise_priority():
    now = datetime.utcnow()
    base = compute_delivery_priority(
        phase=SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
        expected_date=None,
        phase_changed_at=now,
        recovery_open=True,
        unlockable_order_count=0,
        now=now,
    )
    boosted = compute_delivery_priority(
        phase=SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
        expected_date=None,
        phase_changed_at=now,
        recovery_open=True,
        unlockable_order_count=3,
        now=now,
    )
    assert boosted > base


def test_open_pz_and_capacity_factors_in_breakdown():
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
    assert total == round(sum(parts.values()), 2)
    assert parts["open_pz"] == 16.0
    assert parts["unlockable_orders"] == 12.0
    assert parts["capacity"] > 0
    assert parts["slotting"] > 0
    assert parts["phase"] > compute_delivery_priority(
        phase=SUPPLY_FLOW_PHASE_AWIZOWANA,
        expected_date=None,
        phase_changed_at=now,
        now=now,
    )


def test_business_effect_uses_priority_resolution():
    priorities = PriorityResolution(
        delivery_priorities={"1": 150.0},
        ranked_actions=[],
        execution_order=[{"seq": 1, "delivery_id": 1, "phase": "OCZEKUJE_ROZLOKOWANIA", "priority": 150.0}],
        active_delivery_rows=[
            {
                "delivery_id": 1,
                "unlockable_order_count": 2,
                "active": True,
                "priority": 150.0,
            }
        ],
    )
    effect = BusinessEffectBuilder().build(
        SupplyFlowEngineInput(tenant_id=1, warehouse_id=1),
        priorities=priorities,
    )
    assert effect["source"] == "PriorityResolver"
    assert effect["unlockable_order_estimate"] == 2
    assert effect["top_priority_delivery_id"] == 1
    assert "odblokowanie" in effect["summary"].lower() or "Recovery" in effect["summary"]
