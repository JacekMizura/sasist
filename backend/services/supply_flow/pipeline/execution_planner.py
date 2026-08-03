"""ExecutionPlanner — orders Recommendations into ExecutionPlan (Capability Pack 3)."""

from __future__ import annotations

from typing import Any

from .execution_plan import (
    EXECUTION_STATUS_PLANNED,
    ExecutionPlan,
    ExecutionStep,
)

# Display goals only — derived from Recommendation.action (no new decisions).
_ACTION_GOALS: dict[str, str] = {
    "START_PUTAWAY": "Rozlokowanie dostawy",
    "CONTINUE_PUTAWAY": "Kontynuacja rozlokowania",
    "START_UNLOAD": "Rozładunek dostawy",
    "CONTINUE_UNLOAD": "Kontynuacja rozładunku",
    "RECEIVE_DELIVERY": "Przyjęcie dostawy",
    "RECOVERY_WAITING": "Oczekiwanie / Recovery",
    "MONITOR_INBOUND": "Monitorowanie dostawy w drodze",
}


class ExecutionPlanner:
    """
    Capability Pack 3 — sole owner of ExecutionPlan projection.

    Consumes Recommendations in their existing order (already ranked upstream).
    Must NOT change priorities, re-analyze EngineInput, or invent recommendations.
    """

    def plan(self, recommendations: list[dict[str, Any]]) -> ExecutionPlan:
        steps: list[ExecutionStep] = []
        for idx, rec in enumerate(recommendations):
            action = str(rec.get("action") or "")
            label = str(rec.get("label") or action or "—")
            did = rec.get("delivery_id")
            priority = rec.get("priority")
            steps.append(
                ExecutionStep(
                    seq=idx + 1,
                    recommendation_index=idx,
                    action=action,
                    label=label,
                    module=str(rec.get("module") or ""),
                    goal=self._goal(rec),
                    status=EXECUTION_STATUS_PLANNED,
                    delivery_id=int(did) if did is not None else None,
                    pz_id=int(rec["pz_id"]) if rec.get("pz_id") is not None else None,
                    phase=str(rec["phase"]) if rec.get("phase") is not None else None,
                    priority=float(priority) if priority is not None else None,
                    recommendation_ref={
                        "recommendation_index": idx,
                        "action": action,
                        "delivery_id": int(did) if did is not None else None,
                        "pz_id": int(rec["pz_id"]) if rec.get("pz_id") is not None else None,
                        "priority": float(priority) if priority is not None else None,
                        "label": label,
                    },
                )
            )

        return ExecutionPlan(
            steps=steps,
            delivery_groups=self._group_by_delivery(steps),
            status=EXECUTION_STATUS_PLANNED,
            step_count=len(steps),
            meta={
                "source": "ExecutionPlanner",
                "projection_only": True,
                "capability_pack": "execution_planner",
                "preserves_recommendation_order": True,
                "changes_priorities": False,
                "invents_recommendations": False,
            },
        )

    def plan_dict(self, recommendations: list[dict[str, Any]]) -> dict[str, Any]:
        return self.plan(recommendations).to_dict()

    @staticmethod
    def _goal(rec: dict[str, Any]) -> str:
        action = str(rec.get("action") or "")
        if action in _ACTION_GOALS:
            return _ACTION_GOALS[action]
        label = str(rec.get("label") or "").strip()
        if label:
            return label
        return action or "Wykonanie rekomendacji"

    @staticmethod
    def _group_by_delivery(steps: list[ExecutionStep]) -> list[dict[str, Any]]:
        """Group steps by delivery_id preserving first-seen order of deliveries."""
        order: list[int | None] = []
        buckets: dict[int | None, list[ExecutionStep]] = {}
        for step in steps:
            key = step.delivery_id
            if key not in buckets:
                order.append(key)
                buckets[key] = []
            buckets[key].append(step)

        groups: list[dict[str, Any]] = []
        for key in order:
            group_steps = buckets[key]
            groups.append(
                {
                    "delivery_id": key,
                    "step_seqs": [s.seq for s in group_steps],
                    "step_count": len(group_steps),
                    "goals": list(dict.fromkeys(s.goal for s in group_steps)),
                    "actions": [s.action for s in group_steps],
                    "max_priority": max(
                        (s.priority for s in group_steps if s.priority is not None),
                        default=None,
                    ),
                }
            )
        return groups
