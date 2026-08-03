"""Priority aggregation — sum contributions; no policy internals."""

from __future__ import annotations

from .context import PriorityContext
from .contribution import PriorityContribution
from .policy import PriorityPolicy
from .policies import default_priority_policies


def aggregate_priority(
    ctx: PriorityContext,
    policies: list[PriorityPolicy] | None = None,
) -> tuple[float, dict[str, float], list[PriorityContribution]]:
    """
    Run all policies, aggregate scores.

    Returns (total, breakdown_by_source, contributions).
    Breakdown keys match CP1 factor names for identical results / tests.
    """
    pols = policies if policies is not None else default_priority_policies()
    contributions: list[PriorityContribution] = []
    for policy in pols:
        contributions.extend(policy.evaluate(ctx))

    breakdown: dict[str, float] = {}
    for c in contributions:
        breakdown[c.source] = breakdown.get(c.source, 0.0) + float(c.score)

    total = round(sum(breakdown.values()), 2)
    return total, breakdown, contributions
