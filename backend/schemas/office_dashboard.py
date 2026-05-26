"""Main panel (office) dashboard — orders KPIs, no marketplace analytics."""

from __future__ import annotations

from pydantic import BaseModel, Field


class OfficeDashboardKpiOut(BaseModel):
    orders_today: int = Field(..., ge=0)
    orders_yesterday: int = Field(..., ge=0)
    revenue_today: float = Field(..., description="Sum of order.value for orders in today's bucket (PLN)")
    revenue_yesterday: float = Field(..., ge=0)
    #: Suma marży brutto (jak na liście zamówień: wartość po rabacie − koszt zakupu linii).
    gross_profit_today: float = Field(0.0, description="Approximate sum of line gross profit for today's bucket (PLN)")
    gross_profit_yesterday: float = Field(0.0, description="Same for yesterday's bucket (PLN)")
    avg_order_value_today: float = Field(..., ge=0)
    orders_change_pct: float | None = Field(
        None, description="Percent change vs yesterday (orders). Null when not comparable."
    )
    revenue_change_pct: float | None = Field(
        None, description="Percent change vs yesterday (revenue). Null when not comparable."
    )
