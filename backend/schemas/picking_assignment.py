"""Wynik przypisania zamówień do wózka (pick — przed kompletacją) i konfiguracja zachowania."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class PickingAssignmentModeRules(BaseModel):
    """Reguły przypisania dla jednego typu zamówienia (jedno- vs wielopozycyjne)."""

    allow_bulk: bool = Field(True, description="Czy można przypisać do wózka BULK (bez koszyków).")
    allow_basket: bool = Field(True, description="Czy można przypisać do koszyka na wózku MULTI.")


class PickingAssignmentConfig(BaseModel):
    """
    Konfiguracja pickingu — cała logika przypisania powinna z niej wynikać.

    W przyszłości można wczytywać z persistentnego konfiguratora magazynu / tenant.
    """

    single_item: PickingAssignmentModeRules = Field(
        default_factory=PickingAssignmentModeRules,
        description="Reguły dla zamówień jednopozycyjnych (len(items)==1).",
    )
    multi_item: PickingAssignmentModeRules = Field(
        default_factory=PickingAssignmentModeRules,
        description="Reguły dla zamówień wielopozycyjnych (len(items)>1).",
    )
    max_orders_in_bulk: Optional[int] = Field(
        None,
        ge=1,
        description="Opcjonalny limit liczby zamówień na wózku BULK (łącznie), gdy brak limitów per typ pozycji.",
    )
    max_orders_in_bulk_single_item: Optional[int] = Field(
        None,
        ge=1,
        description="Limit liczby jednopozycyjnych zamówień na BULK (niezależny od wielopozycyjnych).",
    )
    max_orders_in_bulk_multi_item: Optional[int] = Field(
        None,
        ge=1,
        description="Limit liczby wielopozycyjnych zamówień na BULK (niezależny od jednopozycyjnych).",
    )


class PickingAssignmentOrderResult(BaseModel):
    order_id: int
    cart_id: int
    basket_id: Optional[int] = None
    volume_dm3: float = Field(0.0, ge=0.0)


class PickingAssignmentRejected(BaseModel):
    order_id: int
    reason: Literal[
        "already_assigned",
        "not_found",
        "warehouse_mismatch",
        "config_disallows_bulk",
        "config_disallows_basket",
        "bulk_max_orders_exceeded",
        "bulk_volume_exceeded",
        "multi_oversized",
        "multi_no_basket",
        "internal_error",
    ]
    detail: Optional[str] = None


class PickingAssignmentBasketSummary(BaseModel):
    basket_id: int
    capacity_dm3: float
    used_volume_dm3: float
    order_ids: list[int] = Field(default_factory=list)


class PickingAssignmentSummary(BaseModel):
    cart_id: int
    cart_type: str
    cart_used_volume_dm3: float
    cart_total_volume_dm3: float
    basket_summaries: list[PickingAssignmentBasketSummary] = Field(default_factory=list)


class PickingAssignmentServiceResult(BaseModel):
    assigned: list[PickingAssignmentOrderResult] = Field(default_factory=list)
    rejected: list[PickingAssignmentRejected] = Field(default_factory=list)
    summary: PickingAssignmentSummary
