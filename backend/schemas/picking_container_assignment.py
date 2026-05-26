"""
Schematy wejścia/wyjścia silnika przypisania zamówień do koszyków (pick / MULTI).

Jednostki: objętość w dm³ (zgodnie z polem orders.total_volume_dm3 i logiką cart_service).
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class PickingOrderLineVolumeIn(BaseModel):
    """Pozycja zamówienia z już wyliczoną objętością jednostkową (dm³)."""

    product_id: int = Field(..., ge=1)
    quantity: int = Field(..., ge=1)
    volume_dm3_per_unit: float = Field(
        0.0,
        ge=0.0,
        description="Objętość jednej sztuki w dm³ (po uwzględnieniu product.volume lub L×W×H/1000).",
    )


class PickingOrderVolumeIn(BaseModel):
    """Zamówienie jako wejście do przypisania — linie lub gotowa suma."""

    order_id: int = Field(..., ge=1)
    order_date: Optional[datetime] = Field(
        None,
        description="Data biznesowa do sortowania (np. orders.order_date).",
    )
    lines: list[PickingOrderLineVolumeIn] = Field(default_factory=list)
    total_volume_dm3: Optional[float] = Field(
        None,
        ge=0.0,
        description="Jeśli podane, silnik nie sumuje linii (np. cache z bazy).",
    )


class PickingBasketSlotIn(BaseModel):
    """Pojedynczy koszyk (slot) z znaną pojemnością objętościową."""

    basket_id: int = Field(..., ge=1)
    capacity_volume_dm3: float = Field(
        ...,
        gt=0.0,
        description="Maks. objętość ładunku w dm³ (np. usable_volume_cm³ / 1000).",
    )


PickingOrderSortMode = Literal["date_asc", "date_desc", "volume_desc", "volume_asc"]


class PickingCartSessionAssignmentRequest(BaseModel):
    """
    Sesja wózka: lista koszyków (np. po skanie wózka MULTI) + kandydaci zamówień.
    """

    cart_id: int = Field(..., ge=1)
    baskets: list[PickingBasketSlotIn]
    orders: list[PickingOrderVolumeIn]
    sort_orders_by: PickingOrderSortMode = "date_asc"
    volume_fallback_dm3: float = Field(
        0.05,
        gt=0.0,
        description="Fallback jednostkowy gdy linia ma 0 objętości (jak cart_service).",
    )


class PickingBasketAssignmentRow(BaseModel):
    """Wynik dla jednego koszyka (wiele zamówień na koszyk dozwolone)."""

    basket_id: int
    assigned_order_ids: list[int] = Field(default_factory=list)
    used_volume_dm3: float = Field(0.0, ge=0.0)
    remaining_capacity_dm3: float = Field(0.0, ge=0.0)


class PickingUnassignedOrderOut(BaseModel):
    order_id: int
    reason: Literal["oversized", "no_capacity_remaining"]
    order_volume_dm3: float = Field(0.0, ge=0.0)


class PickingOrderVolumeComputed(BaseModel):
    order_id: int
    volume_dm3: float = Field(0.0, ge=0.0)


class PickingCartSessionAssignmentResult(BaseModel):
    """
    Struktura zbliżona do cart_session:
    baskets[].assigned_order_ids + used_volume (oraz remaining dla audytu).
    """

    cart_id: int
    baskets: list[PickingBasketAssignmentRow]
    unassigned_orders: list[PickingUnassignedOrderOut]
    order_volumes: list[PickingOrderVolumeComputed] = Field(
        default_factory=list,
        description="Rozpisane objętości wejściowych zamówień (debug / integracje).",
    )
