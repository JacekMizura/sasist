"""API schemas — Smart Matching settings / history / rules."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


SmartMatchingThreshold = Literal[2, 3, 5]


class WmsSmartMatchingSettingsOut(BaseModel):
    enabled: bool = True
    identical_orders_threshold: SmartMatchingThreshold = 3
    proposal_init_status_id: Optional[int] = None
    auto_label_enabled: bool = False
    auto_label_status_ids: list[int] = Field(default_factory=list)


class WmsSmartMatchingSettingsSave(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: int = Field(..., ge=1)
    enabled: bool = True
    identical_orders_threshold: SmartMatchingThreshold = 3
    proposal_init_status_id: Optional[int] = None
    auto_label_enabled: bool = False
    auto_label_status_ids: list[int] = Field(default_factory=list)


class WmsSmartMatchingBreakOut(BaseModel):
    id: int
    order_id: int
    order_number: Optional[str] = None
    user_display: Optional[str] = None
    quantity_units: Optional[float] = None
    chosen_carton_id: Optional[str] = None
    chosen_carton_name: Optional[str] = None
    suggested_carton_id: Optional[str] = None
    created_at: Optional[str] = None


class WmsSmartMatchingHistoryOut(BaseModel):
    id: int
    order_id: int
    order_number: Optional[str] = None
    composition_key: str
    composition_label: str
    carton_id: Optional[str] = None
    carton_name: Optional[str] = None
    suggested_carton_id: Optional[str] = None
    user_display: Optional[str] = None
    quantity_units: Optional[float] = None
    broke_series: bool = False
    created_at: Optional[str] = None
    latest_break: Optional[WmsSmartMatchingBreakOut] = None


class WmsSmartMatchingRuleOut(BaseModel):
    id: int
    composition_key: str
    composition_label: str
    carton_id: str
    carton_name: Optional[str] = None
    hit_count: int
    is_auto: bool
    has_interrupted_series: bool = False
    last_order_id: Optional[int] = None
    last_used_at: Optional[str] = None
    latest_break: Optional[WmsSmartMatchingBreakOut] = None


class WmsSmartMatchingResetOut(BaseModel):
    deleted_rules: int
    message: str = "Usunięto automatycznie utworzone powiązania Smart Matching."
