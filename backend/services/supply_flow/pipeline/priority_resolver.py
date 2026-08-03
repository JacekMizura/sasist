"""PriorityResolver — aggregates PriorityPolicy contributions (no policy internals)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from ..adapters.read import DeliveryReadDTO
from ..constants import SUPPLY_FLOW_PHASE_ZAKONCZONA
from ..engine_input import SupplyFlowEngineInput
from .models import CandidateAction, PriorityResolution, RankedAction
from .priority import (
    DeliveryPriorityFactors,
    PriorityContext,
    PriorityContribution,
    PriorityPolicy,
    aggregate_priority,
    default_priority_policies,
)

# Re-export for CP1 tests / external callers.
__all__ = [
    "DeliveryPriorityFactors",
    "PriorityContext",
    "PriorityContribution",
    "PriorityPolicy",
    "PriorityResolver",
    "compute_delivery_priority",
    "compute_delivery_priority_from_factors",
]


def compute_delivery_priority_from_factors(
    f: DeliveryPriorityFactors | PriorityContext,
    *,
    policies: list[PriorityPolicy] | None = None,
) -> tuple[float, dict[str, float]]:
    """
    Deterministic multi-factor priority via PriorityPolicy aggregation.

    Returns (priority, factor_breakdown). Same numeric results as CP1 monolith.
    """
    total, breakdown, _ = aggregate_priority(f, policies=policies)
    return total, breakdown


def _contributions_payload(
    contributions: list[PriorityContribution],
) -> list[dict[str, float | str]]:
    """Serialize already-computed contributions for ExplainableDecision (projection only)."""
    return [
        {
            "score": float(c.score),
            "reason": str(c.reason),
            "weight": float(c.weight),
            "source": str(c.source),
        }
        for c in contributions
    ]


def compute_delivery_priority(
    *,
    phase: str,
    expected_date: Any,
    phase_changed_at: Any,
    recovery_open: bool = False,
    open_pz_count: int = 0,
    unlockable_order_count: int = 0,
    recovery_ops_count: int = 0,
    avg_utilization_percent: float = 0.0,
    slotted_product_overlap: int = 0,
    slotted_warehouse_count: int = 0,
    item_count: int = 0,
    now: datetime | None = None,
) -> float:
    """Public helper — multi-factor priority (backward compatible kwargs)."""
    total, _ = compute_delivery_priority_from_factors(
        DeliveryPriorityFactors(
            phase=phase,
            expected_date=expected_date,
            phase_changed_at=phase_changed_at,
            open_pz_count=open_pz_count,
            unlockable_order_count=unlockable_order_count,
            recovery_open_warehouse=recovery_open,
            recovery_ops_count=recovery_ops_count,
            avg_utilization_percent=avg_utilization_percent,
            slotted_product_overlap=slotted_product_overlap,
            slotted_warehouse_count=slotted_warehouse_count,
            item_count=item_count,
            now=now,
        )
    )
    return total


def _unlockable_orders_for_delivery(
    delivery_product_ids: tuple[int, ...],
    shortage_links: list[dict[str, Any]],
) -> int:
    if not delivery_product_ids or not shortage_links:
        return 0
    d_set = set(delivery_product_ids)
    unlockable = 0
    for link in shortage_links:
        pids = set(int(x) for x in (link.get("product_ids") or []))
        if d_set & pids:
            unlockable += 1
    return unlockable


def _slotted_overlap(delivery_product_ids: tuple[int, ...], slotted_ids: set[int]) -> int:
    if not delivery_product_ids or not slotted_ids:
        return 0
    return len(set(delivery_product_ids) & slotted_ids)


class PriorityResolver:
    """
    Aggregates PriorityPolicy contributions into PriorityResolution.

    Does not know policy internals — only builds PriorityContext and sums scores.
    """

    def __init__(self, policies: list[PriorityPolicy] | None = None) -> None:
        self._policies = policies if policies is not None else default_priority_policies()

    def resolve(
        self,
        inp: SupplyFlowEngineInput,
        candidates: list[CandidateAction],
        *,
        now: datetime | None = None,
    ) -> PriorityResolution:
        ts = now or datetime.utcnow()
        recovery_open = int(inp.recovery.get("open_issue_task_count") or 0) > 0
        recovery_ops = int(inp.recovery.get("open_operational_task_count") or 0)
        shortage_links = list(inp.recovery.get("shortage_links") or [])
        avg_util = float(inp.capacity.get("avg_utilization_percent") or 0.0)
        slotted_ids = {int(x) for x in (inp.slotting.get("slotted_product_ids") or [])}
        slotted_wh_count = int(inp.slotting.get("slotted_product_count") or 0)

        pz_count_by_delivery: dict[int, int] = {}
        for p in inp.open_pz_awaiting_putaway:
            if p.delivery_id is None:
                continue
            did = int(p.delivery_id)
            pz_count_by_delivery[did] = pz_count_by_delivery.get(did, 0) + 1

        delivery_priorities: dict[str, float] = {}
        active_rows: list[dict[str, Any]] = []
        for d in inp.deliveries:
            ctx = self._context_for_delivery(
                d,
                pz_count=pz_count_by_delivery.get(int(d.id), 0),
                shortage_links=shortage_links,
                recovery_open=recovery_open,
                recovery_ops=recovery_ops,
                avg_util=avg_util,
                slotted_ids=slotted_ids,
                slotted_wh_count=slotted_wh_count,
                now=ts,
            )
            pr, breakdown, contributions = aggregate_priority(ctx, policies=self._policies)
            delivery_priorities[str(d.id)] = pr
            active_rows.append(
                {
                    "delivery_id": int(d.id),
                    "purchase_status": d.purchase_status,
                    "operational_phase": d.operational_phase,
                    "expected_date": str(d.expected_date) if d.expected_date is not None else None,
                    "item_count": int(d.item_count),
                    "priority": pr,
                    "priority_factors": breakdown,
                    # Already-computed policy outputs — for ExplainableDecisionBuilder only.
                    "priority_contributions": _contributions_payload(contributions),
                    "open_pz_count": ctx.open_pz_count,
                    "unlockable_order_count": ctx.unlockable_order_count,
                    "slotted_product_overlap": ctx.slotted_product_overlap,
                    "recovery_open_warehouse": ctx.recovery_open_warehouse,
                    "recovery_ops_count": ctx.recovery_ops_count,
                    "avg_utilization_percent": ctx.avg_utilization_percent,
                    "slotted_warehouse_count": ctx.slotted_warehouse_count,
                    "active": str(d.operational_phase or "").upper() != SUPPLY_FLOW_PHASE_ZAKONCZONA,
                }
            )

        ranked: list[RankedAction] = []
        for c in candidates:
            if c.delivery_id is not None:
                pr = float(delivery_priorities.get(str(c.delivery_id), 0.0))
            elif c.action == "RECOVERY_WAITING":
                pr = 50.0 + min(
                    30.0, float(max(0, int(inp.recovery.get("open_issue_task_count") or 0))) * 2.0
                )
            else:
                pr = 0.0
            ranked.append(RankedAction(candidate=c, priority=pr))

        ranked.sort(key=lambda r: (-r.priority, r.action, r.delivery_id or 0))

        active = inp.active_deliveries()
        ordered = sorted(
            active,
            key=lambda d: (-float(delivery_priorities.get(str(d.id), 0.0)), int(d.id)),
        )
        execution_order = [
            {
                "seq": i + 1,
                "delivery_id": int(d.id),
                "phase": d.operational_phase,
                "priority": float(delivery_priorities.get(str(d.id), 0.0)),
            }
            for i, d in enumerate(ordered)
        ]

        return PriorityResolution(
            delivery_priorities=delivery_priorities,
            ranked_actions=ranked,
            execution_order=execution_order,
            active_delivery_rows=active_rows,
        )

    def _context_for_delivery(
        self,
        d: DeliveryReadDTO,
        *,
        pz_count: int,
        shortage_links: list[dict[str, Any]],
        recovery_open: bool,
        recovery_ops: int,
        avg_util: float,
        slotted_ids: set[int],
        slotted_wh_count: int,
        now: datetime,
    ) -> PriorityContext:
        product_ids = tuple(getattr(d, "product_ids", ()) or ())
        return PriorityContext(
            delivery_id=int(d.id),
            phase=str(d.operational_phase),
            expected_date=d.expected_date,
            phase_changed_at=getattr(d, "operational_phase_changed_at", None),
            open_pz_count=int(pz_count),
            unlockable_order_count=_unlockable_orders_for_delivery(product_ids, shortage_links),
            recovery_open_warehouse=recovery_open,
            recovery_ops_count=recovery_ops,
            avg_utilization_percent=avg_util,
            slotted_product_overlap=_slotted_overlap(product_ids, slotted_ids),
            slotted_warehouse_count=slotted_wh_count,
            item_count=int(d.item_count or 0),
            now=now,
        )
