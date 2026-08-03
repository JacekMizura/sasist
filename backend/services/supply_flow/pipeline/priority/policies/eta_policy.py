"""ETAPolicy — ETA proximity + time waiting in current phase."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from ..context import PriorityContext
from ..contribution import PriorityContribution


def _wait_hours(changed_at: Any, now: datetime) -> float:
    if changed_at is None:
        return 0.0
    try:
        return max(0.0, float((now - changed_at).total_seconds()) / 3600.0)
    except Exception:
        return 0.0


def _eta_boost(expected_date: Any, now: datetime) -> float:
    if expected_date is None:
        return 5.0
    try:
        if hasattr(expected_date, "year") and not hasattr(expected_date, "hour"):
            eta_dt = datetime(expected_date.year, expected_date.month, expected_date.day)
        else:
            eta_dt = expected_date
        hours = (eta_dt - now).total_seconds() / 3600.0
        if hours <= 0:
            return 25.0
        if hours <= 24:
            return 20.0
        if hours <= 72:
            return 10.0
        return 2.0
    except Exception:
        return 0.0


class ETAPolicy:
    name = "ETAPolicy"

    def evaluate(self, ctx: PriorityContext) -> list[PriorityContribution]:
        now = ctx.now or datetime.utcnow()
        eta_score = _eta_boost(ctx.expected_date, now)
        wait_score = min(30.0, _wait_hours(ctx.phase_changed_at, now) * 0.5)
        return [
            PriorityContribution(
                score=eta_score,
                reason="Bliskość ETA / brak ETA",
                weight=1.0,
                source="eta",
            ),
            PriorityContribution(
                score=wait_score,
                reason="Czas oczekiwania w bieżącej fazie",
                weight=0.5,
                source="wait",
            ),
        ]
