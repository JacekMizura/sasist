"""RecommendationBuilder — final Recommendation artifacts only (no business rules)."""

from __future__ import annotations

from typing import Any

from .models import RankedAction


class RecommendationBuilder:
    """
    Responsibility: package ranked actions into Recommendation dicts.

    Must NOT decide which actions exist or their priority — that was done upstream.
    Recommendation is the terminal projection of the pipeline, not a logic host.
    """

    def build(self, ranked_actions: list[RankedAction]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for r in ranked_actions:
            out.append(
                {
                    "action": r.action,
                    "delivery_id": r.delivery_id,
                    "pz_id": r.pz_id,
                    "phase": r.phase,
                    "label": r.label,
                    "module": r.module,
                    "priority": float(r.priority),
                }
            )
        return out
