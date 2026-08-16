"""Demand forecast strategy protocol and registry."""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date

from .constants import (
    DEFAULT_FORECAST_STRATEGY,
    FORECAST_STRATEGIES,
    FORECAST_STRATEGY_PERIOD_AVERAGE,
    FORECAST_STRATEGY_WEEKDAY_AVERAGE,
    FORECAST_STRATEGY_WEIGHTED_AVERAGE,
)


class DemandForecastStrategy(ABC):
    key: str
    label: str

    @abstractmethod
    def daily_rate(self, history: list[tuple[date, float]]) -> float:
        """Expected units sold per day."""


class PeriodAverageStrategy(DemandForecastStrategy):
    key = FORECAST_STRATEGY_PERIOD_AVERAGE
    label = "Standardowa"

    def daily_rate(self, history: list[tuple[date, float]]) -> float:
        if not history:
            return 0.0
        return sum(q for _, q in history) / len(history)


class WeightedAverageStrategy(DemandForecastStrategy):
    key = FORECAST_STRATEGY_WEIGHTED_AVERAGE
    label = "Uwzględniaj trend"

    def daily_rate(self, history: list[tuple[date, float]]) -> float:
        if not history:
            return 0.0
        weights = list(range(1, len(history) + 1))
        total_w = sum(weights)
        return sum(q * w for (_, q), w in zip(history, weights)) / total_w


class WeekdayAverageStrategy(DemandForecastStrategy):
    key = FORECAST_STRATEGY_WEEKDAY_AVERAGE
    label = "Według dni tygodnia"

    def daily_rate(self, history: list[tuple[date, float]]) -> float:
        if not history:
            return 0.0
        target = history[-1][0].weekday()
        same = [q for d, q in history if d.weekday() == target]
        if same:
            return sum(same) / len(same)
        return sum(q for _, q in history) / len(history)


_STRATEGIES: dict[str, DemandForecastStrategy] = {
    s.key: s
    for s in (
        PeriodAverageStrategy(),
        WeightedAverageStrategy(),
        WeekdayAverageStrategy(),
    )
}


def get_forecast_strategy(key: str | None) -> DemandForecastStrategy:
    k = (key or DEFAULT_FORECAST_STRATEGY).strip().upper()
    if k not in _STRATEGIES:
        k = DEFAULT_FORECAST_STRATEGY
    return _STRATEGIES[k]


def list_forecast_strategies() -> list[dict[str, str]]:
    return [{"key": s.key, "label": s.label} for s in _STRATEGIES.values() if s.key in FORECAST_STRATEGIES]
