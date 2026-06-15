"""Request/response models for purchasing alerts API."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

from ..models.purchasing_alert import PurchasingAlertEvent


class PurchasingAlertSummaryOut(BaseModel):
    open_alerts: int
    critical_open: int
    resolved_today: int
    draft_orders_waiting: int


class PurchasingAlertRuleOut(BaseModel):
    id: int
    tenant_id: int
    name: str
    type: str
    is_enabled: bool
    severity: str
    config_json: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PurchasingAlertRuleCreateBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    name: str = Field(..., min_length=1, max_length=256)
    type: str = Field(..., max_length=64)
    severity: str = Field(default="warning", max_length=32)
    config_json: Optional[str] = None
    is_enabled: bool = True


class PurchasingAlertRulePatchBody(BaseModel):
    name: Optional[str] = Field(None, max_length=256)
    is_enabled: Optional[bool] = None
    severity: Optional[str] = Field(None, max_length=32)
    config_json: Optional[str] = None


class PurchasingAlertEventOut(BaseModel):
    id: int
    tenant_id: int
    rule_id: int
    rule_type: str
    rule_name: str
    product_id: Optional[int] = None
    supplier_id: Optional[int] = None
    status: str
    severity: str
    title: str
    message: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime] = None

    @classmethod
    def from_event(cls, ev: PurchasingAlertEvent) -> "PurchasingAlertEventOut":
        r = ev.rule
        payload: Optional[Dict[str, Any]] = None
        if ev.payload_json:
            try:
                payload = json.loads(ev.payload_json)
            except json.JSONDecodeError:
                payload = None
        return cls(
            id=int(ev.id),
            tenant_id=int(ev.tenant_id),
            rule_id=int(ev.rule_id),
            rule_type=(r.type if r else "") or "",
            rule_name=(r.name if r else "") or "",
            product_id=int(ev.product_id) if ev.product_id is not None else None,
            supplier_id=int(ev.supplier_id) if ev.supplier_id is not None else None,
            status=str(ev.status),
            severity=str(ev.severity),
            title=str(ev.title),
            message=ev.message,
            payload=payload,
            created_at=ev.created_at,
            updated_at=ev.updated_at,
            resolved_at=ev.resolved_at,
        )


class PurchasingAlertListOut(BaseModel):
    rows: List[PurchasingAlertEventOut]


class PurchasingAlertRunScanBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: Optional[int] = Field(None, ge=1)


class PurchasingAlertRunScanOut(BaseModel):
    rules_evaluated: int
    events_touched: int
    message: str


class PurchasingAlertCreateDraftBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: int = Field(..., ge=1)


class PurchasingAlertBulkResolveBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    event_ids: List[int] = Field(default_factory=list)

    @field_validator("event_ids")
    @classmethod
    def cap_ids(cls, v: List[int]) -> List[int]:
        if len(v) > 500:
            raise ValueError("At most 500 event_ids allowed")
        return v


class PurchasingAlertBulkResolveOut(BaseModel):
    resolved_ids: List[int]
    skipped_ids: List[int]


class PurchasingAlertCreateDraftOut(BaseModel):
    """Draft POs from critical alerts; same shape as generator bundles plus audit ids."""

    purchase_order_ids: List[int]
    summary: Dict[str, Any]
    created_orders: List[Dict[str, Any]] = Field(default_factory=list)
    skipped_product_ids: List[int] = Field(default_factory=list)
    auto_draft_id: Optional[int] = None


class PurchasingAutoDraftRowOut(BaseModel):
    id: int
    generated_at: datetime
    purchase_order_ids: List[int]
    summary: Optional[Dict[str, Any]] = None


class PurchasingAutoDraftListOut(BaseModel):
    rows: List[PurchasingAutoDraftRowOut]
