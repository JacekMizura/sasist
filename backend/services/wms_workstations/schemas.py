"""Pydantic schemas for WMS workstations API (business language only)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class WorkstationCreateBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    warehouse_id: int = Field(..., ge=1)
    station_type: str = "other"
    description: str | None = None
    is_default: bool = False
    is_active: bool = True


class WorkstationUpdateBody(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    station_type: str | None = None
    description: str | None = None
    warehouse_id: int | None = Field(None, ge=1)
    is_default: bool | None = None
    is_active: bool | None = None


class AgentSummary(BaseModel):
    id: int
    computer_name: str
    machine_id: str
    os: str | None = None
    agent_version: str | None = None
    last_ip: str | None = None
    last_seen_at: datetime | None = None
    created_at: datetime | None = None
    uptime_seconds: int | None = None
    is_online: bool = False
    status: str = "offline"  # online | offline | stale


class WorkstationListItem(BaseModel):
    id: int
    name: str
    station_type: str
    station_type_label: str
    warehouse_id: int
    warehouse_name: str | None = None
    description: str | None = None
    is_default: bool
    is_active: bool
    connection_status: str  # connected | offline | unpaired
    computer_name: str | None = None
    device_count: int = 0
    last_sync_at: datetime | None = None
    agent: AgentSummary | None = None
    # Default mapped printer display name (invoice / labels / …).
    default_printer_name: str | None = None


class WorkstationDetail(WorkstationListItem):
    pairing_active: bool = False
    pairing_expires_at: datetime | None = None


class WorkstationPairingStatus(BaseModel):
    """Lightweight payload for pairing poll (avoids full detail round-trip)."""

    id: int
    connection_status: str
    pairing_active: bool = False
    pairing_expires_at: datetime | None = None
    computer_name: str | None = None
    agent: AgentSummary | None = None


class WorkstationListResponse(BaseModel):
    items: list[WorkstationListItem]


class PairingResponse(BaseModel):
    pairing_code: str
    expires_at: datetime
    message: str = "Wklej kod połączenia w Sasist Agent na komputerze przy tym stanowisku."


class DeviceItem(BaseModel):
    id: int
    name: str
    device_kind: str  # printer | scanner | scale | camera | rfid | barcode_reader | other
    status: str
    last_seen_at: datetime | None = None
    agent_printer_id: int | None = None
    detail: str | None = None


class DevicesGroupedResponse(BaseModel):
    printers: list[DeviceItem] = Field(default_factory=list)
    scanners: list[DeviceItem] = Field(default_factory=list)
    scales: list[DeviceItem] = Field(default_factory=list)
    cameras: list[DeviceItem] = Field(default_factory=list)
    rfid: list[DeviceItem] = Field(default_factory=list)
    barcode_readers: list[DeviceItem] = Field(default_factory=list)
    other: list[DeviceItem] = Field(default_factory=list)


class PrinterOption(BaseModel):
    id: int
    name: str
    system_name: str | None = None
    status: str
    is_online: bool = False


class PrinterMappingRow(BaseModel):
    print_profile: str
    print_profile_label: str
    print_profile_icon: str | None = None
    # Backward-compatible aliases
    print_type: str | None = None
    print_type_label: str | None = None
    agent_printer_id: int | None = None
    printer_name: str | None = None
    status: str | None = None


class PrintersConfigResponse(BaseModel):
    mappings: list[PrinterMappingRow]
    available_printers: list[PrinterOption]


class PrinterMappingPutBody(BaseModel):
    mappings: list[dict[str, Any]] = Field(
        ...,
        description="[{print_profile|print_type, agent_printer_id|null}]",
    )


class HistoryEventItem(BaseModel):
    id: int
    event_type: str
    title: str
    detail: str | None = None
    created_at: datetime


class HistoryResponse(BaseModel):
    items: list[HistoryEventItem]
