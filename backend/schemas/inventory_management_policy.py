"""Schemas for inventory management policy (MODEL B phase 1)."""

from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field

InventoryManagementModeUi = Literal["DOCUMENTS_ONLY", "DIRECT_OPERATIONS"]


class InventoryManagementSettingsRead(BaseModel):
    tenant_id: int
    warehouse_id: int
    inventory_management_mode: InventoryManagementModeUi = "DIRECT_OPERATIONS"
    can_manual_adjust_stock: bool = True
    manual_adjustment_allowed: bool = True
    allow_manual_warehouse_document_execution: bool = False
    manual_warehouse_document_execution_available: bool = False


class InventoryManagementSettingsSave(BaseModel):
    tenant_id: int
    warehouse_id: Optional[int] = None
    inventory_management_mode: InventoryManagementModeUi


class ManualStockCorrectionRequest(BaseModel):
    tenant_id: int = Field(ge=1)
    warehouse_id: int = Field(ge=1)
    product_id: int = Field(ge=1)
    location_id: int = Field(ge=1)
    quantity_delta: float = Field(description="Signed delta — positive increases, negative decreases")
    reason: str = Field(min_length=3, max_length=500)
    stock_disposition: Optional[str] = None
    batch_number: Optional[str] = None
    expiration_date: Optional[date] = None


class ManualStockCorrectionResponse(BaseModel):
    stock_document_id: int
    document_type: str
    document_number: Optional[str] = None
    quantity_delta: float
    product_id: int
    location_id: int
    stock_disposition: str
    reason: str
