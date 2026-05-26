"""WMS picking UI flow — statusy wyłącznie z konfiguracji + normalizacja trybów dla frontu."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

from .order import OrderUiMainGroup
from .picking_config import PickingConfigMode, PickingConfigOrderSort, PickingConfigPickUnit

# Tryby zwracane do UI (mapowanie z DB: bulk/scanned/baskets/mobile)
PickingFlowMode = Literal["cart_scan", "cart_no_scan", "baskets", "mobile"]
PickingFlowStrategy = Literal["by_date", "by_location"]


class WmsPickingConfiguredStatusItem(BaseModel):
    """Status panelu powiązany z rekordem ``picking_config`` + licznik zamówień i hint ikony trybu."""

    source_status_id: int = Field(..., description="ID statusu panelu — parametr ``status`` w GET /wms/picking/config")
    status: str = Field(..., description="Nazwa statusu (etykieta)")
    color: str
    main_group: OrderUiMainGroup
    order_count: int = Field(..., ge=0, description="Liczba zamówień w magazynie z tym statusem panelu")
    require_cart: bool = Field(
        ...,
        description="True gdy konfiguracja wymaga skanu wózka / trybu koszykowego (scanned|baskets)",
    )
    cart_type: Optional[Literal["BULK", "BASKETS"]] = Field(
        default=None,
        description="Przy require_cart: BULK = skan wózka zbiorczego; BASKETS = koszyki na wózku",
    )


class WmsPickingFlowLimits(BaseModel):
    single: int | None = None
    multi: int | None = None


class WmsPickingFlowConfigRead(BaseModel):
    source_status_id: int
    target_status_id: int
    status_on_shortage_id: Optional[int] = Field(
        default=None,
        description="Status panelu po zgłoszeniu braku — z konfiguracji zbierania",
    )
    single_mode: PickingFlowMode
    multi_mode: PickingFlowMode
    strategy: PickingFlowStrategy
    pick_unit: PickingConfigPickUnit
    order_sort: PickingConfigOrderSort
    limits: WmsPickingFlowLimits


class WmsPickingConfigReplaceItem(BaseModel):
    source_status_id: int = Field(..., ge=1, description="Status do zbierania (panel)")
    target_status_id: int = Field(..., ge=1, description="Status po zebraniu")
    single_mode: PickingConfigMode
    multi_mode: PickingConfigMode
    pick_unit: PickingConfigPickUnit = Field(..., description="orders = zamówienie po zamówieniu; products = agregat produktów")
    order_sort: PickingConfigOrderSort = Field(
        default="date",
        description="Przy pick_unit=orders: kolejność kolejki zamówień; courier — placeholder (jak data)",
    )
    max_single_orders: Optional[int] = Field(default=None, ge=1)
    max_multi_orders: Optional[int] = Field(default=None, ge=1)
    status_on_shortage_id: Optional[int] = Field(
        default=None,
        ge=1,
        description="Opcjonalny status po zgłoszeniu braku na magazynie",
    )

    @model_validator(mode="after")
    def _source_ne_target(self) -> "WmsPickingConfigReplaceItem":
        if int(self.source_status_id) == int(self.target_status_id):
            raise ValueError("source_status_id i target_status_id muszą się różnić.")
        return self


class WmsPickingConfigReplaceBody(BaseModel):
    """Pełna lista reguł zbierania dla magazynu — zastępuje istniejące wiersze (transakcyjnie)."""

    items: list[WmsPickingConfigReplaceItem] = Field(..., min_length=1)
