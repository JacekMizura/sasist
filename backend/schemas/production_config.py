"""API schematy dla konfiguracji produkcji (semantycznie niezależne od picking UI)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

ProductionOrderTriggerScope = Literal["SINGLE_ELEMENT"]
ProductionExecutionMethod = Literal["WMS", "PRINT"]
AfterProductionAction = Literal["STATUS_ONLY", "OPEN_PACKING"]


class ProductionConfigRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    name: str
    is_active: bool = True
    source_status_id: int
    status_after_production_id: int
    status_on_component_shortage_id: int
    finished_goods_buffer_location_id: int
    production_order_trigger_scope: ProductionOrderTriggerScope = "SINGLE_ELEMENT"
    production_execution_method: ProductionExecutionMethod = "WMS"
    after_production_action: AfterProductionAction = "STATUS_ONLY"
    created_at: datetime
    source_status_name: Optional[str] = None
    status_after_production_name: Optional[str] = None
    status_on_component_shortage_name: Optional[str] = None
    finished_goods_buffer_location_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ProductionConfigCreate(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: int = Field(..., ge=1)
    name: str = Field(..., min_length=1, max_length=128)
    is_active: bool = True
    source_status_id: int = Field(..., ge=1)
    status_after_production_id: int = Field(..., ge=1)
    status_on_component_shortage_id: int = Field(..., ge=1)
    finished_goods_buffer_location_id: int = Field(..., ge=1)
    production_order_trigger_scope: Optional[ProductionOrderTriggerScope] = "SINGLE_ELEMENT"
    production_execution_method: Optional[ProductionExecutionMethod] = "WMS"
    after_production_action: Optional[AfterProductionAction] = "STATUS_ONLY"

    @model_validator(mode="after")
    def _source_ne_after(self) -> "ProductionConfigCreate":
        if int(self.source_status_id) == int(self.status_after_production_id):
            raise ValueError("status_after_production_id musi być inny niż source_status_id.")
        return self


class ProductionConfigUpdate(BaseModel):
    """PUT — bez zmiany tenant/warehouse/source_status (stabilne ID dla MO)."""

    name: str = Field(..., min_length=1, max_length=128)
    is_active: bool = True
    status_after_production_id: int = Field(..., ge=1)
    status_on_component_shortage_id: int = Field(..., ge=1)
    finished_goods_buffer_location_id: int = Field(..., ge=1)
    production_order_trigger_scope: Optional[ProductionOrderTriggerScope] = "SINGLE_ELEMENT"
    production_execution_method: Optional[ProductionExecutionMethod] = "WMS"
    after_production_action: Optional[AfterProductionAction] = "STATUS_ONLY"


class ProductionConfigListResponse(BaseModel):
    items: list[ProductionConfigRead]
