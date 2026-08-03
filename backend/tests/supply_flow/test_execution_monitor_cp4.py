"""Capability Pack 4 — ExecutionMonitor / ExecutionState."""

from __future__ import annotations

from backend.services.supply_flow.events.types import (
    EVENT_EXECUTION_CANCELLED,
    EVENT_EXECUTION_FAILED,
    EVENT_PUTAWAY_FINISHED,
    EVENT_PUTAWAY_STARTED,
    EVENT_UNLOAD_FINISHED,
    EVENT_UNLOAD_STARTED,
)
from backend.services.supply_flow.execution_monitor import (
    EXECUTION_STATUSES,
    EXECUTION_STATUS_DONE,
    EXECUTION_STATUS_FAILED,
    EXECUTION_STATUS_IN_PROGRESS,
    EXECUTION_STATUS_READY,
    EXECUTION_STATUS_SKIPPED,
    ExecutionMonitor,
)
from backend.services.supply_flow.pipeline import describe_pipeline
from backend.services.supply_flow.pipeline.execution_planner import ExecutionPlanner


def _sample_plan():
    recs = [
        {
            "action": "CONTINUE_RECEIVING",
            "label": "Rozładunek",
            "module": "receiving",
            "delivery_id": 10,
            "pz_id": 1,
            "phase": "ROZLADUNEK",
            "priority": 100.0,
        },
        {
            "action": "START_PUTAWAY",
            "label": "Rozlokowanie",
            "module": "putaway",
            "delivery_id": 10,
            "pz_id": 1,
            "phase": "OCZEKUJE_ROZLOKOWANIA",
            "priority": 90.0,
        },
    ]
    return ExecutionPlanner().plan_dict(recs)


def test_execution_statuses_canonical():
    assert EXECUTION_STATUSES == (
        "PLANNED",
        "READY",
        "IN_PROGRESS",
        "DONE",
        "BLOCKED",
        "SKIPPED",
        "FAILED",
    )


def test_pipeline_documents_execution_monitor():
    info = describe_pipeline()
    assert "ExecutionMonitor" in info["flow"]
    assert info["execution_monitor_mutates_execution_plan"] is False
    assert info["execution_monitor_changes_priorities"] is False


def test_seed_does_not_mutate_plan_and_marks_first_ready():
    plan = _sample_plan()
    plan_before = {
        "steps": [dict(s) for s in plan["steps"]],
        "delivery_groups": list(plan["delivery_groups"]),
        "status": plan["status"],
    }
    state = ExecutionMonitor().seed_from_plan(plan)
    assert plan["steps"] == plan_before["steps"]
    assert plan["delivery_groups"] == plan_before["delivery_groups"]
    assert state.steps[0].status == EXECUTION_STATUS_READY
    assert state.steps[0].seq == 1
    assert state.meta["mutates_execution_plan"] is False
    assert state.meta["changes_priorities"] is False


def test_monitor_applies_wms_unload_and_putaway_events():
    plan = _sample_plan()
    monitor = ExecutionMonitor()
    state = monitor.seed_from_plan(plan)

    state = monitor.apply_event(
        state,
        plan,
        {
            "event_type": EVENT_UNLOAD_STARTED,
            "delivery_id": 10,
            "pz_id": 1,
        },
    )
    assert state.steps[0].status == EXECUTION_STATUS_IN_PROGRESS
    assert state.steps[0].last_event == EVENT_UNLOAD_STARTED
    # Plan steps unchanged
    assert plan["steps"][0]["status"] == "PLANNED"

    state = monitor.apply_event(
        state,
        plan,
        {"event_type": EVENT_UNLOAD_FINISHED, "delivery_id": 10, "pz_id": 1},
    )
    assert state.steps[0].status == EXECUTION_STATUS_DONE
    assert state.steps[1].status == EXECUTION_STATUS_READY

    state = monitor.apply_event(
        state,
        plan,
        {"event_type": EVENT_PUTAWAY_STARTED, "delivery_id": 10, "pz_id": 1},
    )
    assert state.steps[1].status == EXECUTION_STATUS_IN_PROGRESS

    state = monitor.apply_event(
        state,
        plan,
        {"event_type": EVENT_PUTAWAY_FINISHED, "delivery_id": 10, "pz_id": 1},
    )
    assert state.steps[1].status == EXECUTION_STATUS_DONE
    assert state.status == EXECUTION_STATUS_DONE


def test_monitor_cancel_and_fail():
    plan = _sample_plan()
    monitor = ExecutionMonitor()
    state = monitor.seed_from_plan(plan)
    state = monitor.apply_event(
        state,
        plan,
        {
            "event_type": EVENT_EXECUTION_CANCELLED,
            "delivery_id": 10,
            "pz_id": 1,
            "payload": {"note": "anulowano"},
        },
    )
    assert all(s.status == EXECUTION_STATUS_SKIPPED for s in state.steps)

    state2 = monitor.seed_from_plan(plan)
    state2 = monitor.apply_event(
        state2,
        plan,
        {
            "event_type": EVENT_EXECUTION_FAILED,
            "delivery_id": 10,
            "pz_id": 1,
            "payload": {"note": "błąd skanu"},
        },
    )
    assert all(s.status == EXECUTION_STATUS_FAILED for s in state2.steps)
    assert state2.status == EXECUTION_STATUS_FAILED
