"""ExplainableDecisionBuilder — projects pipeline artifacts into explanations (CP2)."""

from __future__ import annotations

from typing import Any

from .explainable_decision import ExplainableDecision
from .models import PriorityResolution

# Display labels only — maps contribution.source → policy name (no scoring).
_SOURCE_TO_POLICY: dict[str, str] = {
    "phase": "PhasePolicy",
    "eta": "ETAPolicy",
    "wait": "ETAPolicy",
    "open_pz": "DemandPolicy",
    "unlockable_orders": "DemandPolicy",
    "item_volume": "DemandPolicy",
    "recovery_pressure": "RecoveryPolicy",
    "capacity": "CapacityPolicy",
    "slotting": "SlottingPolicy",
}

_TOP_N = 3

_INPUT_KEYS = (
    "delivery_id",
    "operational_phase",
    "expected_date",
    "item_count",
    "open_pz_count",
    "unlockable_order_count",
    "slotted_product_overlap",
    "slotted_warehouse_count",
    "recovery_open_warehouse",
    "recovery_ops_count",
    "avg_utilization_percent",
    "priority",
    "priority_factors",
)


class ExplainableDecisionBuilder:
    """
    Capability Pack 2 — sole owner of ExplainableDecision projection.

    Consumes Recommendation + PriorityResolution contributions + BusinessEffect.
    Must NOT recalculate priorities or run business rules.
    """

    def build(
        self,
        recommendations: list[dict[str, Any]],
        priorities: PriorityResolution | None,
        business_effect: dict[str, Any] | None = None,
    ) -> list[ExplainableDecision]:
        effect = dict(business_effect or {})
        rows_by_id = self._rows_by_delivery(priorities)
        out: list[ExplainableDecision] = []
        for rec in recommendations:
            did = rec.get("delivery_id")
            row = rows_by_id.get(int(did)) if did is not None else None
            contributions = list((row or {}).get("priority_contributions") or [])
            top = self._top_policies(contributions)
            why = self._why(rec, contributions, top, effect)
            inputs_used = self._inputs_used(rec, row)
            per_effect = self._business_effect_slice(rec, row, effect)
            out.append(
                ExplainableDecision(
                    decision={
                        "action": rec.get("action"),
                        "label": rec.get("label"),
                        "module": rec.get("module"),
                        "delivery_id": did,
                        "pz_id": rec.get("pz_id"),
                        "phase": rec.get("phase"),
                        "priority": rec.get("priority"),
                    },
                    why=why,
                    top_policies=top,
                    inputs_used=inputs_used,
                    business_effect=per_effect,
                    delivery_id=int(did) if did is not None else None,
                    priority=float(rec["priority"]) if rec.get("priority") is not None else None,
                    meta={
                        "source": "ExplainableDecisionBuilder",
                        "projection_only": True,
                        "capability_pack": "explainable_decision",
                    },
                )
            )
        return out

    def build_dicts(
        self,
        recommendations: list[dict[str, Any]],
        priorities: PriorityResolution | None,
        business_effect: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        return [e.to_dict() for e in self.build(recommendations, priorities, business_effect)]

    @staticmethod
    def _rows_by_delivery(priorities: PriorityResolution | None) -> dict[int, dict[str, Any]]:
        if priorities is None:
            return {}
        out: dict[int, dict[str, Any]] = {}
        for row in priorities.active_delivery_rows:
            did = row.get("delivery_id")
            if did is None:
                continue
            out[int(did)] = row
        return out

    @staticmethod
    def _top_policies(contributions: list[dict[str, Any]]) -> list[dict[str, Any]]:
        scored = sorted(
            contributions,
            key=lambda c: (-float(c.get("score") or 0.0), str(c.get("source") or "")),
        )
        top: list[dict[str, Any]] = []
        for c in scored:
            if float(c.get("score") or 0.0) <= 0.0:
                continue
            source = str(c.get("source") or "")
            top.append(
                {
                    "policy": _SOURCE_TO_POLICY.get(source, source or "UnknownPolicy"),
                    "source": source,
                    "score": float(c.get("score") or 0.0),
                    "weight": float(c.get("weight") or 0.0),
                    "reason": str(c.get("reason") or ""),
                }
            )
            if len(top) >= _TOP_N:
                break
        return top

    @staticmethod
    def _why(
        rec: dict[str, Any],
        contributions: list[dict[str, Any]],
        top: list[dict[str, Any]],
        effect: dict[str, Any],
    ) -> list[str]:
        _ = contributions  # available for future packs; CP2 uses top_policies.reasons
        why: list[str] = []
        label = rec.get("label") or rec.get("action") or "rekomendacja"
        priority = rec.get("priority")
        if priority is not None:
            why.append(
                f"Rekomendacja «{label}» z priorytetem {float(priority):.2f} "
                f"(wynik PriorityResolver)."
            )
        else:
            why.append(f"Rekomendacja «{label}» (wynik pipeline).")

        for t in top:
            reason = str(t.get("reason") or "").strip()
            if reason:
                why.append(reason)

        if not top and rec.get("action") == "RECOVERY_WAITING":
            why.append(
                "Sygnał Recovery na poziomie magazynu "
                "(projekcja PriorityResolver, bez wkładów Phase/Demand)."
            )
            if effect.get("summary"):
                why.append(str(effect["summary"]))

        return why

    @staticmethod
    def _inputs_used(rec: dict[str, Any], row: dict[str, Any] | None) -> dict[str, Any]:
        if row:
            return {k: row.get(k) for k in _INPUT_KEYS if k in row}
        # Warehouse-level / no delivery row — only recommendation facts already decided.
        return {
            "action": rec.get("action"),
            "delivery_id": rec.get("delivery_id"),
            "pz_id": rec.get("pz_id"),
            "phase": rec.get("phase"),
            "priority": rec.get("priority"),
            "module": rec.get("module"),
        }

    @staticmethod
    def _business_effect_slice(
        rec: dict[str, Any],
        row: dict[str, Any] | None,
        effect: dict[str, Any],
    ) -> dict[str, Any]:
        """Attach plan-level BusinessEffect; enrich with row unlock hint when present."""
        out: dict[str, Any] = {
            "summary": effect.get("summary"),
            "notes": list(effect.get("notes") or []),
            "unlockable_order_estimate": effect.get("unlockable_order_estimate"),
            "top_priority_delivery_id": effect.get("top_priority_delivery_id"),
            "top_priority_value": effect.get("top_priority_value"),
            "recovery_open_count": effect.get("recovery_open_count"),
            "awaiting_putaway_delivery_count": effect.get("awaiting_putaway_delivery_count"),
            "source": effect.get("source") or "BusinessEffectBuilder",
            "quantitative": effect.get("quantitative", False),
        }
        if row is not None:
            out["delivery_unlockable_order_count"] = int(row.get("unlockable_order_count") or 0)
            out["delivery_open_pz_count"] = int(row.get("open_pz_count") or 0)
            did = rec.get("delivery_id")
            if (
                did is not None
                and effect.get("top_priority_delivery_id") is not None
                and int(did) == int(effect["top_priority_delivery_id"])
            ):
                out["is_top_priority_delivery"] = True
            else:
                out["is_top_priority_delivery"] = False
        return out
