"""P4 — multi-warehouse UI read schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class WarehouseStockSnapshotRead(BaseModel):
    warehouse_id: int
    warehouse_name: str
    physical_quantity: int = 0
    available_quantity: int = 0
    reserved_quantity: int = 0
    commercially_sellable_qty: float = 0.0


class ProductWarehouseStockBreakdownRead(BaseModel):
    product_id: int
    tenant_id: int
    warehouses: List[WarehouseStockSnapshotRead] = Field(default_factory=list)
    network_totals: Dict[str, Any] = Field(default_factory=dict)


class ProductWarehouseSlottingRowRead(BaseModel):
    warehouse_id: int
    warehouse_name: str
    location_codes: List[str] = Field(default_factory=list)


class ProductWarehouseSlottingAllRead(BaseModel):
    product_id: int
    tenant_id: int
    warehouses: List[ProductWarehouseSlottingRowRead] = Field(default_factory=list)


class OrderFulfillmentAssignmentAuditRead(BaseModel):
    id: int
    order_id: int
    assigned_warehouse_id: int
    assigned_warehouse_name: str = ""
    strategy: str = ""
    assigned_by_user_id: Optional[int] = None
    assigned_by_label: str = "AUTO"
    reason: Optional[str] = None
    created_at: datetime


class TenantWarehouseNetworkRowRead(BaseModel):
    warehouse_id: int
    warehouse_name: str
    physical_quantity: int = 0
    commercially_sellable_qty: float = 0.0
    reserved_quantity: int = 0


class TenantWarehouseNetworkSummaryRead(BaseModel):
    tenant_id: int
    warehouses: List[TenantWarehouseNetworkRowRead] = Field(default_factory=list)
    totals: Dict[str, Any] = Field(default_factory=dict)
