"""ExecutionMonitor — tracks ExecutionStep runtime state from WMS events (CP4)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from .event_mapping import (
    EVENT_ACTION_FAMILIES,
    EVENT_TO_STEP_STATUS,
    MONITOR_EVENT_TYPES,
)
from .state import ExecutionState, StepExecutionState
from .status import (
    EXECUTION_STATUS_BLOCKED,
    EXECUTION_STATUS_DONE,
    EXECUTION_STATUS_FAILED,
    EXECUTION_STATUS_IN_PROGRESS,
    EXECUTION_STATUS_PLANNED,
    EXECUTION_STATUS_READY,
    EXECUTION_STATUS_SKIPPED,
    is_terminal,
)


class ExecutionMonitor:
    """
    Capability Pack 4 — sole owner of ExecutionState transitions.

    Does NOT change priorities, Recommendations, ExecutionPlan structure, or step order.
    Only updates ExecutionState (runtime overlay).
    """

    def seed_from_plan(
        self,
        execution_plan: dict[str, Any],
        *,
        plan_version: int | None = None,
        previous: ExecutionState | None = None,
        now: datetime | None = None,
    ) -> ExecutionState:
        """
        Build ExecutionState aligned to ExecutionPlan.steps by ``seq``.

        Optionally carry forward terminal statuses for matching identity keys.
        """
        ts = (now or datetime.utcnow()).isoformat()
        plan_steps = list(execution_plan.get("steps") or [])
        prev_by_key = self._index_previous(previous)

        steps: list[StepExecutionState] = []
        for raw in plan_steps:
            seq = int(raw["seq"])
            action = str(raw.get("action") or "")
            did = int(raw["delivery_id"]) if raw.get("delivery_id") is not None else None
            pz = int(raw["pz_id"]) if raw.get("pz_id") is not None else None
            key = self._identity_key(action, did, pz)
            carried = prev_by_key.get(key)
            if carried is not None and is_terminal(carried.status):
                status = carried.status
                last_event = carried.last_event
                note = carried.note
            else:
                status = EXECUTION_STATUS_PLANNED
                last_event = None
                note = None
            steps.append(
                StepExecutionState(
                    seq=seq,
                    status=status,
                    delivery_id=did,
                    pz_id=pz,
                    action=action,
                    last_event=last_event,
                    updated_at=ts,
                    note=note,
                )
            )

        state = ExecutionState(
            steps=steps,
            plan_step_count=len(steps),
            plan_version=plan_version,
            updated_at=ts,
            meta={
                "source": "ExecutionMonitor",
                "projection_only": True,
                "capability_pack": "execution_monitor",
                "mutates_execution_plan": False,
                "changes_priorities": False,
                "changes_recommendations": False,
            },
        )
        self._promote_ready(state)
        state.status = self._aggregate_status(state)
        return state

    def seed_dict(
        self,
        execution_plan: dict[str, Any],
        *,
        plan_version: int | None = None,
        previous: dict[str, Any] | None = None,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        prev = ExecutionState.from_dict(previous) if previous else None
        return self.seed_from_plan(
            execution_plan,
            plan_version=plan_version,
            previous=prev,
            now=now,
        ).to_dict()

    def apply_event(
        self,
        state: ExecutionState,
        execution_plan: dict[str, Any],
        event: Any,
        *,
        now: datetime | None = None,
    ) -> ExecutionState:
        """Apply one WMS event onto ExecutionState. Plan is read-only reference."""
        _ = execution_plan  # contract reference — never mutated
        ev_type, delivery_id, pz_id, note = self._event_fields(event)
        if ev_type not in MONITOR_EVENT_TYPES:
            return state

        target = EVENT_TO_STEP_STATUS[ev_type]
        family = EVENT_ACTION_FAMILIES.get(ev_type, frozenset())
        ts = (now or datetime.utcnow()).isoformat()
        matched = False

        for step in state.steps:
            if is_terminal(step.status) and target not in (
                EXECUTION_STATUS_FAILED,
                EXECUTION_STATUS_SKIPPED,
            ):
                continue
            if not self._step_matches(step, family=family, delivery_id=delivery_id, pz_id=pz_id):
                continue
            step.status = target
            step.last_event = ev_type
            step.updated_at = ts
            if note:
                step.note = note
            matched = True

        if matched:
            self._promote_ready(state)
            state.updated_at = ts
            state.status = self._aggregate_status(state)
            state.meta = {
                **(state.meta or {}),
                "last_applied_event": ev_type,
                "mutates_execution_plan": False,
            }
        return state

    def apply_events(
        self,
        state: ExecutionState,
        execution_plan: dict[str, Any],
        events: list[Any],
        *,
        now: datetime | None = None,
    ) -> ExecutionState:
        for ev in events:
            state = self.apply_event(state, execution_plan, ev, now=now)
        return state

    # --- helpers ---

    @staticmethod
    def _event_fields(event: Any) -> tuple[str, int | None, int | None, str | None]:
        if isinstance(event, dict):
            ev_type = str(event.get("event_type") or "")
            delivery_id = int(event["delivery_id"]) if event.get("delivery_id") is not None else None
            pz_id = int(event["pz_id"]) if event.get("pz_id") is not None else None
            payload = event.get("payload") or {}
            note = str(payload.get("note")) if payload.get("note") else None
            return ev_type, delivery_id, pz_id, note
        payload = getattr(event, "payload", None) or {}
        note = str(payload.get("note")) if payload.get("note") else None
        delivery_id = getattr(event, "delivery_id", None)
        pz_id = getattr(event, "pz_id", None)
        return (
            str(getattr(event, "event_type", "") or ""),
            int(delivery_id) if delivery_id is not None else None,
            int(pz_id) if pz_id is not None else None,
            note,
        )
    @staticmethod
    def _identity_key(
        action: str, delivery_id: int | None, pz_id: int | None
    ) -> tuple[str, int | None, int | None]:
        a = (action or "").upper()
        if a in {
            "START_UNLOAD",
            "CONTINUE_UNLOAD",
            "CONTINUE_RECEIVING",
            "RECEIVE_DELIVERY",
        }:
            family = "unload"
        elif a in {
            "START_PUTAWAY",
            "CONTINUE_PUTAWAY",
            "CONSIDER_CROSS_DOCK",
        }:
            family = "putaway"
        else:
            family = a or "other"
        return (family, delivery_id, pz_id)

    def _index_previous(
        self, previous: ExecutionState | None
    ) -> dict[tuple[str, int | None, int | None], StepExecutionState]:
        if previous is None:
            return {}
        out: dict[tuple[str, int | None, int | None], StepExecutionState] = {}
        for s in previous.steps:
            key = self._identity_key(str(s.action or ""), s.delivery_id, s.pz_id)
            # Prefer terminal when multiple.
            existing = out.get(key)
            if existing is None or is_terminal(s.status):
                out[key] = s
        return out

    @staticmethod
    def _step_matches(
        step: StepExecutionState,
        *,
        family: frozenset[str],
        delivery_id: int | None,
        pz_id: int | None,
    ) -> bool:
        action = str(step.action or "")
        if family and action not in family:
            return False
        if delivery_id is not None and step.delivery_id is not None:
            if int(step.delivery_id) != int(delivery_id):
                return False
        elif delivery_id is not None and step.delivery_id is None:
            return False
        if pz_id is not None and step.pz_id is not None:
            if int(step.pz_id) != int(pz_id):
                return False
        # If event has no delivery filter, match family-wide (rare).
        return True

    @staticmethod
    def _promote_ready(state: ExecutionState) -> None:
        """First non-terminal PLANNED step becomes READY — does not reorder."""
        for step in sorted(state.steps, key=lambda s: int(s.seq)):
            if is_terminal(step.status):
                continue
            if step.status in (
                EXECUTION_STATUS_IN_PROGRESS,
                EXECUTION_STATUS_READY,
                EXECUTION_STATUS_BLOCKED,
            ):
                return
            if step.status == EXECUTION_STATUS_PLANNED:
                step.status = EXECUTION_STATUS_READY
                return

    @staticmethod
    def _aggregate_status(state: ExecutionState) -> str:
        if not state.steps:
            return EXECUTION_STATUS_PLANNED
        statuses = [s.status for s in state.steps]
        if any(s == EXECUTION_STATUS_FAILED for s in statuses):
            return EXECUTION_STATUS_FAILED
        if any(s == EXECUTION_STATUS_IN_PROGRESS for s in statuses):
            return EXECUTION_STATUS_IN_PROGRESS
        if any(s == EXECUTION_STATUS_BLOCKED for s in statuses):
            return EXECUTION_STATUS_BLOCKED
        if all(s in (EXECUTION_STATUS_DONE, EXECUTION_STATUS_SKIPPED) for s in statuses):
            return EXECUTION_STATUS_DONE
        if any(s == EXECUTION_STATUS_READY for s in statuses):
            return EXECUTION_STATUS_READY
        if any(s == EXECUTION_STATUS_SKIPPED for s in statuses) and any(
            s == EXECUTION_STATUS_PLANNED for s in statuses
        ):
            return EXECUTION_STATUS_READY
        return EXECUTION_STATUS_PLANNED
