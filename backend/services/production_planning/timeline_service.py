"""Stock timeline projection for planning charts."""

from __future__ import annotations

from .lead_time_service import estimated_completion_date


def build_stock_timeline(
    *,
    on_hand: float,
    in_pipeline: float,
    daily_rate: float,
    lead_time_days: int,
    recommended_qty: float,
) -> list[dict[str, float | str]]:
    """
    Timeline points for UI chart:
    current → depletion → production start → production end → new level.
    """
    points: list[dict[str, float | str]] = []
    current = max(0.0, float(on_hand))
    pipeline = max(0.0, float(in_pipeline))
    rate = max(0.0, float(daily_rate))
    lt = max(0, int(lead_time_days))
    rec = max(0.0, float(recommended_qty))

    points.append({"offset_days": 0.0, "quantity": round(current, 2), "phase": "current"})

    depletion_day = None
    if rate > 1e-9:
        depletion_day = current / rate
        points.append({"offset_days": round(depletion_day, 1), "quantity": 0.0, "phase": "depletion"})

    points.append({"offset_days": 0.0, "quantity": round(current, 2), "phase": "production_start"})

    end_day = float(lt)
    consumed = rate * end_day
    after = max(0.0, current + pipeline + rec - consumed)
    points.append({"offset_days": end_day, "quantity": round(after, 2), "phase": "production_end"})

    completion = estimated_completion_date(lead_time=lt)
    points.append(
        {
            "offset_days": end_day,
            "quantity": round(after, 2),
            "phase": "completion",
            "completion_date": completion.isoformat(),
        }
    )

    return points
