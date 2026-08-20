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
    packaging_strategy: str = "SMART_THEN_3D"
    legacy_v1_fallback_enabled: bool = True


class WmsSmartMatchingSettingsSave(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: int = Field(..., ge=1)
    enabled: bool = True
    identical_orders_threshold: SmartMatchingThreshold = 3
    proposal_init_status_id: Optional[int] = None
    auto_label_enabled: bool = False
    auto_label_status_ids: list[int] = Field(default_factory=list)
    packaging_strategy: Optional[str] = None
    legacy_v1_fallback_enabled: Optional[bool] = None


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
    created_from_history_id: Optional[int] = None
    created_threshold: Optional[int] = None
    latest_break: Optional[WmsSmartMatchingBreakOut] = None


class WmsSmartMatchingCompositionItemOut(BaseModel):
    product_id: int
    product_name: str
    quantity: int


class WmsSmartMatchingSeriesHitOut(BaseModel):
    history_id: int
    hit_index: int
    order_id: int
    order_number: Optional[str] = None
    operator: Optional[str] = None
    created_at: Optional[str] = None
    carton_id: Optional[str] = None
    carton_name: Optional[str] = None
    suggested_carton_id: Optional[str] = None
    suggested_carton_name: Optional[str] = None
    broke_series: bool = False
    is_override: bool = False
    is_decisive: bool = False


class WmsSmartMatchingHistorySeriesItemOut(BaseModel):
    composition_key: str
    composition_preview: str
    composition_extra_count: int = 0
    composition_items: list[WmsSmartMatchingCompositionItemOut] = Field(default_factory=list)
    composition_label_fallback: Optional[str] = None
    carton_id: str
    carton_name: Optional[str] = None
    hit_count: int
    threshold: int
    current_threshold: int
    created_threshold: Optional[int] = None
    has_active_rule: bool = False
    rule_id: Optional[int] = None
    created_from_history_id: Optional[int] = None
    last_operator: Optional[str] = None
    last_at: Optional[str] = None
    override_count: int = 0
    has_overrides: bool = False
    hits: list[WmsSmartMatchingSeriesHitOut] = Field(default_factory=list)


class WmsSmartMatchingHistorySeriesPageOut(BaseModel):
    page: int
    limit: int
    total: int
    current_threshold: int
    items: list[WmsSmartMatchingHistorySeriesItemOut] = Field(default_factory=list)


class WmsSmartMatchingResetOut(BaseModel):
    deleted_rules: int
    message: str = "Usunięto automatycznie utworzone powiązania Smart Matching."
