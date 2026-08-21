"""Pydantic schemas — Backend Automation Engine API."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


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
    model_config = ConfigDict(populate_by_name=True)

    tenant_id: int = Field(..., ge=1)
    warehouse_id: Optional[int] = Field(default=None, ge=1)
    entity_type: EntityType
    name: str = Field(..., min_length=1, max_length=255)
    group: str = "Ogólne"
    enabled: bool = True
    trigger_type: str = "entity_status_entered"
    trigger_config: dict[str, Any] = Field(default_factory=dict)
    conditions: list[dict[str, Any]] = Field(default_factory=list)
    rule_metadata: dict[str, Any] = Field(default_factory=dict, alias="metadata")
    source: str = "USER"
    effects: list[AutomationEffectIn] = Field(default_factory=list)


class AutomationRuleUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    group: Optional[str] = None
    enabled: Optional[bool] = None
    warehouse_id: Optional[int] = Field(default=None, ge=1)
    clear_warehouse: bool = False
    trigger_type: Optional[str] = None
    trigger_config: Optional[dict[str, Any]] = None
    conditions: Optional[list[dict[str, Any]]] = None
    rule_metadata: Optional[dict[str, Any]] = Field(default=None, alias="metadata")
    effects: Optional[list[AutomationEffectIn]] = None


class AutomationRuleOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    tenant_id: int
    warehouse_id: Optional[int] = None
    entity_type: str
    name: str
    group: str = "Ogólne"
    enabled: bool
    trigger_type: str
    trigger_config: dict[str, Any] = Field(default_factory=dict)
    conditions: list[Any] = Field(default_factory=list)
    rule_metadata: dict[str, Any] = Field(default_factory=dict, alias="metadata")
    source: str
    runtime_ready: bool = True
    validation_issues: list[dict[str, Any]] = Field(default_factory=list)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    effects: list[AutomationEffectOut] = Field(default_factory=list)


class StatusActionRuleOut(AutomationRuleOut):
    last_execution_status: Optional[str] = None
    last_run_at: Optional[str] = None


class StatusActionUpsertIn(BaseModel):
    tenant_id: int = Field(..., ge=1)
    entity_type: EntityType
    status_id: int = Field(..., ge=1)
    warehouse_id: Optional[int] = Field(default=None, ge=1)
    status_name: Optional[str] = None
    effects: list[AutomationEffectIn] = Field(default_factory=list)


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
    trigger_event_id: Optional[str] = None
    run_kind: str = "AUTO"
    idempotency_key: str
    status: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None
    effect_executions: list[AutomationEffectExecutionOut] = Field(default_factory=list)


class AutomationRunRequest(BaseModel):
    tenant_id: int = Field(..., ge=1)
    entity_type: EntityType
    entity_id: int = Field(..., ge=1)
    check_conditions: bool = True
    dry_run: bool = False


class AutomationTestRequest(BaseModel):
    tenant_id: int = Field(..., ge=1)
    entity_type: EntityType = "ORDER"
    entity_id: Optional[int] = Field(default=None, ge=1)
    #: Default True — evaluate only; no side effects.
    dry_run: bool = True
    check_conditions: bool = True


class LegacyImportRequest(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: int = Field(..., ge=1)
    entity_type: EntityType = "ORDER"
    rules: list[dict[str, Any]] = Field(default_factory=list)


class LegacyImportResult(BaseModel):
    created: int
    skipped: int
    errors: list[str] = Field(default_factory=list)
    rule_ids: list[int] = Field(default_factory=list)
