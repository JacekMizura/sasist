"""
Supply Flow Event Dispatcher.

Sole consumer of published events. WMS modules must not call the Engine.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from ..plan_models import LivingPlanResult
from ..recompute import RecomputeRequest, request_recompute
from . import buffer as event_buffer
from .handlers import apply_event_side_effects
from .types import EVENT_TO_RECOMPUTE_TRIGGER, SupplyFlowEvent

logger = logging.getLogger(__name__)


@dataclass
class DispatchBatchResult:
    tenant_id: int
    warehouse_id: int
    events_in: int
    events_after_dedupe: int
    primary_event_type: str | None
    recompute_trigger: str | None
    phase_steps: list[str] = field(default_factory=list)
    plan: LivingPlanResult | None = None
    skipped: bool = False
    error: str | None = None


@dataclass
class DispatchFlushResult:
    batches: list[DispatchBatchResult] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return all(b.error is None for b in self.batches)


def dedupe_events(events: list[SupplyFlowEvent]) -> list[SupplyFlowEvent]:
    """Keep last occurrence per dedupe_key (debounce within flush window)."""
    by_key: dict[tuple, SupplyFlowEvent] = {}
    order: list[tuple] = []
    for ev in events:
        k = ev.dedupe_key()
        if k not in by_key:
            order.append(k)
        by_key[k] = ev
    return [by_key[k] for k in order]


def group_events(events: list[SupplyFlowEvent]) -> dict[tuple[int, int], list[SupplyFlowEvent]]:
    groups: dict[tuple[int, int], list[SupplyFlowEvent]] = {}
    for ev in events:
        groups.setdefault(ev.group_key(), []).append(ev)
    return groups


def select_primary_event(events: list[SupplyFlowEvent]) -> SupplyFlowEvent:
    """Highest priority (lowest rank) wins; tie → earlier in buffer order."""
    return min(enumerate(events), key=lambda pair: (pair[1].priority(), pair[0]))[1]


class SupplyFlowEventDispatcher:
    """
    Pipeline: buffer drain → dedupe → group by warehouse → side-effects → one recompute.
    """

    def dispatch_pending(self, db: Session) -> DispatchFlushResult:
        raw = event_buffer.clear_buffer()
        if not raw:
            return DispatchFlushResult(batches=[])
        return self.dispatch_events(db, raw)

    def dispatch_events(self, db: Session, events: list[SupplyFlowEvent]) -> DispatchFlushResult:
        deduped = dedupe_events(events)
        groups = group_events(deduped)
        results: list[DispatchBatchResult] = []
        for (tenant_id, warehouse_id), group in sorted(groups.items()):
            results.append(
                self._dispatch_warehouse_batch(
                    db,
                    tenant_id=tenant_id,
                    warehouse_id=warehouse_id,
                    events=group,
                    events_in=len([e for e in events if e.group_key() == (tenant_id, warehouse_id)]),
                )
            )
        return DispatchFlushResult(batches=results)

    def _dispatch_warehouse_batch(
        self,
        db: Session,
        *,
        tenant_id: int,
        warehouse_id: int,
        events: list[SupplyFlowEvent],
        events_in: int,
    ) -> DispatchBatchResult:
        primary = select_primary_event(events)
        trigger = EVENT_TO_RECOMPUTE_TRIGGER.get(primary.event_type)
        batch = DispatchBatchResult(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            events_in=events_in,
            events_after_dedupe=len(events),
            primary_event_type=primary.event_type,
            recompute_trigger=trigger,
        )
        try:
            with db.begin_nested():
                batch.phase_steps = apply_event_side_effects(db, events)
                focus_delivery = primary.delivery_id
                if focus_delivery is None:
                    for ev in events:
                        if ev.delivery_id is not None:
                            focus_delivery = ev.delivery_id
                            break
                if trigger is not None:
                    batch.plan = request_recompute(
                        db,
                        RecomputeRequest(
                            tenant_id=tenant_id,
                            warehouse_id=warehouse_id,
                            trigger=trigger,
                            delivery_id=focus_delivery,
                            order_id=primary.order_id,
                        ),
                    )
                else:
                    batch.skipped = True

                # CP4: update ExecutionState overlay from WMS events (never mutates ExecutionPlan).
                from ..execution_monitor.sync import sync_execution_state_for_warehouse

                sync_execution_state_for_warehouse(
                    db,
                    tenant_id=tenant_id,
                    warehouse_id=warehouse_id,
                    events=events,
                    plan=batch.plan,
                )
            logger.info(
                "supply_flow.dispatcher batch tenant=%s warehouse=%s primary=%s "
                "in=%s deduped=%s phase_steps=%s plan_v=%s",
                tenant_id,
                warehouse_id,
                primary.event_type,
                events_in,
                len(events),
                batch.phase_steps,
                batch.plan.plan_version if batch.plan else None,
            )
        except Exception as exc:
            batch.error = str(exc)
            logger.exception(
                "supply_flow.dispatcher batch failed tenant=%s warehouse=%s",
                tenant_id,
                warehouse_id,
            )
        return batch


def dispatch_pending_events(db: Session) -> DispatchFlushResult:
    """Module-level helper used by tests / manual flush."""
    return SupplyFlowEventDispatcher().dispatch_pending(db)


def describe_pipeline() -> dict[str, Any]:
    """Documentation helper for reports / diagnostics."""
    return {
        "flow": [
            "WMS module",
            "publish_supply_flow_event",
            "event buffer (debounce window)",
            "SupplyFlowEventDispatcher",
            "dedupe → group(warehouse) → priority primary",
            "handlers (lifecycle side-effects)",
            "request_recompute → SupplyFlowEngine (when trigger mapped)",
            "ExecutionMonitor → ExecutionState (WMS events)",
            "LivingSupplyFlowPlan",
        ],
        "module_may_call": ["publish_supply_flow_event"],
        "module_must_not_call": [
            "SupplyFlowEngine",
            "request_recompute",
            "notify_* hooks (legacy)",
        ],
        "execution_monitor_mutates_plan": False,
        "execution_monitor_changes_priorities": False,
    }
