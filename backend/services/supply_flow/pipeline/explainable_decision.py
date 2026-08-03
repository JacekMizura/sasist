"""ExplainableDecision — projection of an Engine recommendation (Capability Pack 2)."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class ExplainableDecision:
    """
    Full explanation of one recommendation already produced by the pipeline.

    Pure projection — does not decide, re-score, or invent actions.
    """

    decision: dict[str, Any]
    why: list[str]
    top_policies: list[dict[str, Any]]
    inputs_used: dict[str, Any]
    business_effect: dict[str, Any]
    delivery_id: int | None = None
    priority: float | None = None
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
