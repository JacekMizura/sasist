"""RecoveryPolicy — warehouse Recovery / operational task pressure."""

from __future__ import annotations

from ..context import PriorityContext
from ..contribution import PriorityContribution


class RecoveryPolicy:
    name = "RecoveryPolicy"

    def evaluate(self, ctx: PriorityContext) -> list[PriorityContribution]:
        score = 0.0
        if ctx.recovery_open_warehouse:
            score += 10.0
        if ctx.recovery_ops_count > 0:
            score += min(15.0, float(ctx.recovery_ops_count) * 2.0)
        return [
            PriorityContribution(
                score=score,
                reason=(
                    f"Ciśnienie Recovery (open={ctx.recovery_open_warehouse}, "
                    f"ops={ctx.recovery_ops_count})"
                ),
                weight=1.0,
                source="recovery_pressure",
            )
        ]
