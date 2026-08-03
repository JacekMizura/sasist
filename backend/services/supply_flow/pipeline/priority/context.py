"""PriorityContext — single input object for every PriorityPolicy."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class PriorityContext:
    """
    Shared context for PriorityPolicy.evaluate(ctx).

    Built once per delivery from SupplyFlowEngineInput (READ aggregates only).
    """

    phase: str
    expected_date: Any
    phase_changed_at: Any
    open_pz_count: int
    unlockable_order_count: int
    recovery_open_warehouse: bool
    recovery_ops_count: int
    avg_utilization_percent: float
    slotted_product_overlap: int
    slotted_warehouse_count: int
    item_count: int
    now: datetime | None = None
    delivery_id: int | None = None


# Backward-compatible alias used by CP1 tests / helpers.
DeliveryPriorityFactors = PriorityContext
