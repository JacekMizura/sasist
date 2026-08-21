"""Pydantic schemas — Backend Automation Engine API."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


EntityType = Literal["ORDER", "RETURN", "COMPLAINT"]


class AutomationEffectIn(BaseModel):
    effect_type: str
    position: int = 0
    config: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class AutomationEffectOut(BaseModel):
    id: int
    position: int
    effect_type: str
    config: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class AutomationRuleCreate(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: Optional[int] = Field(default=None, ge=1)
    entity_type: EntityType
    name: str = Field(..., min_length=1, max_length=255)
    enabled: bool = True
    trigger_type: str = "entity_status_entered"
    trigger_config: dict[str, Any] = Field(default_factory=dict)
    source: str = "USER"
    effects: list[AutomationEffectIn] = Field(default_factory=list)


class AutomationRuleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    enabled: Optional[bool] = None
    warehouse_id: Optional[int] = Field(default=None, ge=1)
    clear_warehouse: bool = False
    trigger_type: Optional[str] = None
    trigger_config: Optional[dict[str, Any]] = None
    effects: Optional[list[AutomationEffectIn]] = None


class AutomationRuleOut(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: Optional[int] = None
    entity_type: str
    name: str
    enabled: bool
    trigger_type: str
    trigger_config: dict[str, Any] = Field(default_factory=dict)
    source: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    effects: list[AutomationEffectOut] = Field(default_factory=list)


class AutomationEffectExecutionOut(BaseModel):
    id: int
    effect_id: Optional[int] = None
    position: int
    effect_type: str
    status: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None
    result: Optional[dict[str, Any]] = None


class AutomationExecutionOut(BaseModel):
    id: int
    rule_id: int
    entity_type: str
    entity_id: int
    trigger_event_id: str
    idempotency_key: str
    status: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None
    effect_executions: list[AutomationEffectExecutionOut] = Field(default_factory=list)
