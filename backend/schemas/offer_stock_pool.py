"""Offer stock pool API schemas."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class OfferStockPoolWarehouseBrief(BaseModel):
    id: int
    name: str


class OfferStockPoolRead(BaseModel):
    id: int
    tenant_id: int
    name: str
    is_default: bool
    warehouse_ids: List[int] = Field(default_factory=list)
    warehouses: List[OfferStockPoolWarehouseBrief] = Field(default_factory=list)
    eligible_warehouse_ids: List[int] = Field(default_factory=list)
    eligible_warehouses: List[OfferStockPoolWarehouseBrief] = Field(default_factory=list)


class OfferStockPoolCreateBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    warehouse_ids: List[int] = Field(default_factory=list)
    is_default: bool = False


class OfferStockPoolPatchBody(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=256)
    warehouse_ids: Optional[List[int]] = None
    is_default: Optional[bool] = None


class OfferStockPoolsListOut(BaseModel):
    items: List[OfferStockPoolRead]
