"""Wynik routingu pickingu po lokalizacjach (tylko odczyt stanów — bez MM / kompletacji)."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class PickListBasketBreakdown(BaseModel):
    basket_id: Optional[int] = Field(None, description="NULL przy zbiorze BULK (cały wózek).")
    quantity: float = Field(..., ge=0)


class PickListRow(BaseModel):
    location_id: int
    location_code: str
    product_id: int
    total_quantity: float = Field(..., ge=0)
    baskets: list[PickListBasketBreakdown] = Field(default_factory=list)


class PickingRoutingAllocationShortfall(BaseModel):
    order_id: int
    product_id: int
    requested: float
    allocated: float


class PickingRoutingResult(BaseModel):
    pick_list: list[PickListRow] = Field(default_factory=list)
    """Posortowane po ``location_code`` rosnąco."""
    shortfalls: list[PickingRoutingAllocationShortfall] = Field(
        default_factory=list,
        description="Pozycje, gdzie suma stanów magazynowych < wymagana ilość.",
    )
    warnings: list[str] = Field(
        default_factory=list,
        description="Np. brak zamówienia po filtrze tenanta lub brak pozycji na magazynie.",
    )
