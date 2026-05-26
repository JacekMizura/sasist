from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    login: str = Field(..., min_length=1, description="Login or email")
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class WmsProfileInput(BaseModel):
    """WMS workstation profile — nested under create/update user."""

    barcode_login_code: str | None = None
    language: str = "pl"
    default_warehouse_id: int | None = None
    warehouse_ids: list[int] = Field(default_factory=list)
    require_scan_every_product: bool = False
    can_edit_products_preview: bool = False
    picking_permissions: list[str] | None = None
    packing_permissions: list[str] | None = None
    picker_color: str | None = None
    packing_station_id: int | None = None
    default_printer_id: int | None = None
    timezone: str = "Europe/Warsaw"
    wms_operational_modes: list[str] = Field(default_factory=list)
    workforce_supervisor_user_id: int | None = None
    workforce_employment_type: str | None = None
    workforce_shift_type: str | None = None
    workforce_active_warehouse_zone_ids: list[int] = Field(default_factory=list)
    workforce_default_workstation: str | None = None
    workforce_color_tag: str | None = None


class WmsProfileUpdate(BaseModel):
    """Partial WMS profile for PATCH — unset fields are left unchanged."""

    barcode_login_code: str | None = None
    language: str | None = None
    default_warehouse_id: int | None = None
    warehouse_ids: list[int] | None = None
    require_scan_every_product: bool | None = None
    can_edit_products_preview: bool | None = None
    picking_permissions: list[str] | None = None
    packing_permissions: list[str] | None = None
    picker_color: str | None = None
    packing_station_id: int | None = None
    default_printer_id: int | None = None
    timezone: str | None = None
    wms_operational_modes: list[str] | None = None
    workforce_supervisor_user_id: int | None = None
    workforce_employment_type: str | None = None
    workforce_shift_type: str | None = None
    workforce_active_warehouse_zone_ids: list[int] | None = None
    workforce_default_workstation: str | None = None
    workforce_color_tag: str | None = None


class WmsProfileResponse(BaseModel):
    barcode_login_code: str | None = None
    language: str = "pl"
    default_warehouse_id: int | None = None
    warehouse_ids: list[int] = Field(default_factory=list)
    require_scan_every_product: bool = False
    can_edit_products_preview: bool = False
    picking_permissions: list[str] | None = None
    packing_permissions: list[str] | None = None
    picker_color: str | None = None
    packing_station_id: int | None = None
    default_printer_id: int | None = None
    timezone: str = "Europe/Warsaw"
    wms_operational_modes: list[str] = Field(default_factory=list)
    workforce_supervisor_user_id: int | None = None
    workforce_employment_type: str | None = None
    workforce_shift_type: str | None = None
    workforce_active_warehouse_zone_ids: list[int] = Field(default_factory=list)
    workforce_default_workstation: str | None = None
    workforce_color_tag: str | None = None


class PrimaryWorkforceGroupBadge(BaseModel):
    id: int
    name: str
    color: str = "#64748b"
    icon_key: str = "Users"


class MeResponse(BaseModel):
    id: int
    login: str
    email: str | None
    first_name: str | None
    last_name: str | None
    role: str
    is_active: bool
    language: str
    permissions: list[str]
    explicit_permissions: list[str] = Field(default_factory=list)
    last_login_at: datetime | None
    password_must_change: bool = False
    is_system_seed: bool = False
    show_dev_credentials_warning: bool = False
    phone: str | None = None
    avatar_url: str | None = None
    created_at: datetime | None = None
    wms_profile: WmsProfileResponse
    # Deprecated flat mirrors for older clients (derived from wms_profile).
    wms_language: str | None = None
    barcode_login_code: str | None = None
    default_warehouse_id: int | None = None
    warehouse_ids: list[int] = Field(default_factory=list)
    primary_workforce_group_id: int | None = None
    primary_workforce_group: PrimaryWorkforceGroupBadge | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6)


class AppUserListItem(BaseModel):
    id: int
    login: str
    email: str | None
    first_name: str | None
    last_name: str | None
    role: str
    is_active: bool
    language: str
    last_login_at: datetime | None
    created_at: datetime | None = None
    phone: str | None = None
    warehouse_summary: str | None = None
    warehouse_names: list[str] = Field(default_factory=list)
    default_warehouse_id: int | None = None
    is_system_seed: bool = False
    wms_language: str | None = None
    primary_workforce_group: PrimaryWorkforceGroupBadge | None = None
    wms_operational_modes: list[str] = Field(default_factory=list)


class AppUserCreate(BaseModel):
    login: str = Field(..., min_length=2, max_length=128)
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=6)
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    avatar_url: str | None = None
    role: str = Field(default="user")
    is_active: bool = True
    language: str = "pl"
    wms_language: str = "pl"
    wms_currency: str = "PLN"
    permissions: list[str] = Field(default_factory=list)
    wms_profile: WmsProfileInput = Field(default_factory=WmsProfileInput)
    primary_workforce_group_id: int | None = None


class AppUserUpdate(BaseModel):
    email: str | None = None
    password: str | None = Field(None, min_length=6)
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    avatar_url: str | None = None
    role: str | None = None
    is_active: bool | None = None
    language: str | None = None
    wms_language: str | None = None
    wms_currency: str | None = None
    permissions: list[str] | None = None
    wms_profile: WmsProfileUpdate | None = None
    primary_workforce_group_id: int | None = None


class AdminResetPasswordBody(BaseModel):
    password: str = Field(..., min_length=6)


class AuditLogItem(BaseModel):
    id: int
    created_at: datetime
    user_id: int | None
    login: str | None
    action: str
    module: str | None
    entity_type: str | None
    entity_id: int | None
    detail: dict | None
