"""Edge Device Registry schemas — sync, actions, events, full device shape."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class CapabilityDescriptorRead(BaseModel):
    name: str
    version: str = "1"
    supported_operations: list[str] = Field(default_factory=list)
    limits: dict[str, Any] | None = None


class DeviceConfigurationRead(BaseModel):
    values: dict[str, Any] = Field(default_factory=dict)
    configuration_version: str = "0"
    updated_at: datetime | None = None


class DeviceHealthRead(BaseModel):
    health_score: float | int = 50
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)


class EdgeDeviceRead(BaseModel):
    id: str
    type: str
    manufacturer: str | None = None
    model: str | None = None
    serial_number: str | None = None
    driver: str | None = None
    firmware: str | None = None
    status: str = "unknown"
    capabilities: list[CapabilityDescriptorRead] = Field(default_factory=list)
    last_seen: datetime | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    agent_id: int | None = None
    module_id: str | None = None
    display_name: str | None = None
    is_active: bool = True
    is_default: bool = False
    configuration: DeviceConfigurationRead | None = None
    health: DeviceHealthRead | None = None
    configuration_version: str | None = None
    sync_revision: str | None = None
    legacy_printer_id: int | None = None
    # Surrogate PK for ERP deep links
    registry_id: int | None = None


class EdgeModuleRead(BaseModel):
    id: str
    agent_id: int
    agent_name: str | None = None
    machine_id: str | None = None
    state: str = "unknown"
    version: str | None = None
    device_count: int = 0
    capabilities: list[str] = Field(default_factory=list)
    last_seen: datetime | None = None
    is_online: bool = False
    last_error: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class EdgeDeviceUpsert(BaseModel):
    id: str
    type: str
    display_name: str | None = None
    module_id: str = "custom"
    manufacturer: str | None = None
    model: str | None = None
    serial_number: str | None = None
    driver: str | None = None
    firmware: str | None = None
    status: str = "unknown"
    capabilities: list[CapabilityDescriptorRead] = Field(default_factory=list)
    last_seen: datetime | None = None
    is_active: bool = True
    is_default: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)
    configuration: DeviceConfigurationRead | None = None
    health: DeviceHealthRead | None = None
    sync_revision: str | None = None


class EdgeDeviceEventIn(BaseModel):
    event_type: str
    device_id: str | None = None
    module_id: str | None = None
    device_type: str | None = None
    occurred_at: datetime | None = None
    payload: dict[str, Any] | None = None


class DeviceSyncRequest(BaseModel):
    client_cursor: str | None = None
    heartbeat_at: datetime | None = None
    upserts: list[EdgeDeviceUpsert] = Field(default_factory=list)
    removes: list[str] = Field(default_factory=list)
    events: list[EdgeDeviceEventIn] = Field(default_factory=list)


class ConfigurationUpdateOut(BaseModel):
    device_id: str
    values: dict[str, Any] = Field(default_factory=dict)
    configuration_version: str
    updated_at: datetime | None = None


class PendingActionOut(BaseModel):
    action: str
    module_id: str | None = None
    device_id: str | None = None
    correlation_id: str
    parameters: dict[str, Any] | None = None


class DeviceSyncResponse(BaseModel):
    server_cursor: str
    configuration_updates: list[ConfigurationUpdateOut] = Field(default_factory=list)
    pending_actions: list[PendingActionOut] = Field(default_factory=list)


class CreateActionRequest(BaseModel):
    action: str
    agent_id: int
    module_id: str | None = None
    device_id: str | None = None
    parameters: dict[str, Any] | None = None


class ActionResultRequest(BaseModel):
    correlation_id: str
    accepted: bool
    completed: bool
    action: str
    error_code: str | None = None
    error_message: str | None = None
    data: dict[str, Any] | None = None


class UpdateDeviceConfigurationRequest(BaseModel):
    values: dict[str, Any] = Field(default_factory=dict)
    configuration_version: str | None = None


class EdgeDeviceEventRead(BaseModel):
    id: int
    agent_id: int
    device_id: str | None = None
    event_type: str
    module_id: str | None = None
    device_type: str | None = None
    occurred_at: datetime
    payload: dict[str, Any] = Field(default_factory=dict)


class EdgeDeviceActionRead(BaseModel):
    id: int
    agent_id: int
    correlation_id: str
    action: str
    module_id: str | None = None
    device_id: str | None = None
    status: str
    parameters: dict[str, Any] | None = None
    result: dict[str, Any] | None = None
    error_code: str | None = None
    error_message: str | None = None
    created_at: datetime | None = None
    completed_at: datetime | None = None
