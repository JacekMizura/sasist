"""Wejście/wyjście warstwy Picking Orchestrator — jeden punkt wejścia dla trybów zbierania WMS."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from .picking_assignment import PickingAssignmentConfig, PickingAssignmentSummary

PickingOrchestratorMode = Literal["BULK", "SCANNED_CART", "BASKETS", "MOBILE"]


class PickingOrchestrationConfig(BaseModel):
    """
    Konfiguracja z UI / magazynu: tryb per typ zamówienia + reguły ``PickingAssignmentService``.

    ``SCANNED_CART`` i ``BULK`` wymagają fizycznie wózka BULK; ``BASKETS`` — wózka MULTI z koszykami.
    """

    mode_single: PickingOrchestratorMode = Field(
        ...,
        description="Tryb dla zamówień z dokładnie jedną pozycją (len(items)==1).",
    )
    mode_multi: PickingOrchestratorMode = Field(
        ...,
        description="Tryb dla zamówień z więcej niż jedną pozycją (len(items)>1).",
    )
    assignment: PickingAssignmentConfig = Field(
        default_factory=PickingAssignmentConfig,
        description="Reguły przypisania (BULK/MULTI) przekazywane do PickingAssignmentService.",
    )


class PickingOrchestratorUnassignedOrder(BaseModel):
    order_id: int
    reasons: list[str] = Field(default_factory=list)


class PickingOrchestratorAssignedEntry(BaseModel):
    order_id: int
    picking_mode: PickingOrchestratorMode
    cart_id: Optional[int] = None
    basket_id: Optional[int] = None
    volume_dm3: float = Field(0.0, ge=0.0)


class PickingOrchestratorRunSummary(BaseModel):
    total_input_orders: int
    assigned_count: int
    unassigned_count: int
    mobile_queue_count: int
    bulk_assigned_count: int = 0
    baskets_assigned_count: int = 0
    assignment_service_invoked: bool = False


class PickingOrchestratorResult(BaseModel):
    """Wynik pojedynczego przebiegu orchestratora (retry: ponowne wywołanie z tymi samymi ID pomija już przypisane)."""

    mode_single: PickingOrchestratorMode
    mode_multi: PickingOrchestratorMode
    assigned_containers: list[PickingOrchestratorAssignedEntry] = Field(default_factory=list)
    unassigned_orders: list[PickingOrchestratorUnassignedOrder] = Field(default_factory=list)
    cart_summaries: list[PickingAssignmentSummary] = Field(
        default_factory=list,
        description="Streszczenia wózka z ostatniego wywołania PickingAssignmentService (jeśli było).",
    )
    summary: PickingOrchestratorRunSummary
