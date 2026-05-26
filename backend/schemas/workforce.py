"""Pydantic schemas — workforce operations (non-HR)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class UserActivityLogCreate(BaseModel):
    action_type: str = Field(..., max_length=96)
    module: str = Field(..., max_length=64)
    tenant_id: Optional[int] = None
    entity_type: Optional[str] = Field(None, max_length=80)
    entity_id: Optional[int] = None
    metadata: Optional[dict[str, Any]] = None


class UserActivityLogRead(BaseModel):
    id: int
    user_id: Optional[int]
    login: Optional[str] = None
    tenant_id: Optional[int]
    action_type: str
    module: str
    entity_type: Optional[str]
    entity_id: Optional[int]
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[str]


class EmployeeCostProfileUpsert(BaseModel):
    tenant_id: Optional[int] = None
    contract_type: str = Field("uop", max_length=16)
    gross_monthly_pln: Optional[float] = None
    employer_total_monthly_pln: Optional[float] = None
    net_monthly_pln: Optional[float] = None
    default_hours_per_month: float = 168.0
    ppk_enabled: bool = False
    employer_side_rate_override: Optional[float] = None
    notes: Optional[str] = None
    is_active: bool = True


class EmployeeCostProfileRead(BaseModel):
    user_id: int
    tenant_id: Optional[int]
    contract_type: str
    gross_monthly_pln: Optional[float]
    employer_total_monthly_pln: Optional[float]
    net_monthly_pln: Optional[float]
    default_hours_per_month: float
    hourly_pln: Optional[float]
    employer_hourly_pln: Optional[float]
    ppk_enabled: bool
    employer_side_rate_override: Optional[float]
    notes: Optional[str]
    is_active: bool
    assumptions: dict[str, Any] = Field(default_factory=dict)


class EmployeeCostOverviewRow(BaseModel):
    user_id: int
    login: str
    full_name: Optional[str] = None
    workstation: Optional[str] = None
    employment_label: Optional[str] = None
    contract_type: str
    net_monthly_pln: Optional[float] = None
    gross_monthly_pln: Optional[float] = None
    employer_total_monthly_pln: Optional[float] = None
    hourly_pln: Optional[float] = None
    employer_hourly_pln: Optional[float] = None
    is_active_account: bool = True
    has_cost_profile: bool = False


class EmployeeCostOverviewRead(BaseModel):
    disclaimer_pl: str
    rows: list[EmployeeCostOverviewRow]
    total_employees: int
    employees_with_cost_numbers: int
    sum_net_monthly_pln: float
    sum_gross_monthly_pln: float
    sum_employer_total_monthly_pln: float
    avg_employer_total_monthly_pln: Optional[float] = None


class WorkforceStatusAccessRow(BaseModel):
    id: Optional[int] = None
    tenant_id: int
    warehouse_id: int
    role: str = Field(..., max_length=64)
    order_ui_status_id: int
    status_name: Optional[str] = None
    main_group: Optional[str] = None
    can_visible: bool = True
    can_edit: bool = False
    can_transition: bool = False
    can_process: bool = False
    can_print: bool = False
    can_complete: bool = False


class WorkforceStatusAccessUpsert(BaseModel):
    tenant_id: int
    warehouse_id: int
    role: str = Field(..., max_length=64)
    order_ui_status_id: int
    can_visible: bool = True
    can_edit: bool = False
    can_transition: bool = False
    can_process: bool = False
    can_print: bool = False
    can_complete: bool = False


class WorkforceUserStatusEffectiveRow(BaseModel):
    order_ui_status_id: int
    status_name: str | None = None
    main_group: str | None = None
    role: str
    role_can_visible: bool
    role_can_edit: bool
    role_can_transition: bool
    role_can_process: bool
    role_can_print: bool
    role_can_complete: bool
    effective_can_visible: bool
    effective_can_edit: bool
    effective_can_transition: bool
    effective_can_process: bool
    effective_can_print: bool
    effective_can_complete: bool
    has_user_override: bool = False


class WorkforceUserStatusFlagsItem(BaseModel):
    order_ui_status_id: int
    can_visible: bool = True
    can_edit: bool = False
    can_transition: bool = False
    can_process: bool = False
    can_print: bool = False
    can_complete: bool = False


class WorkforceUserStatusSaveBody(BaseModel):
    tenant_id: int
    warehouse_id: int
    user_id: int
    items: list[WorkforceUserStatusFlagsItem]


class WorkforceDashboardQuery(BaseModel):
    tenant_id: Optional[int] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
