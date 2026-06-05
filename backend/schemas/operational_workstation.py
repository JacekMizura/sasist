"""Operational workstation schemas."""

from __future__ import annotations

from pydantic import BaseModel


class OperationalWorkstationRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    code: str
    name: str
    device_type: str | None = None
    operational_zone_id: int | None = None
    printer_id: int | None = None
    scanner_type: str | None = None
    fiscal_terminal_id: int | None = None
    zone_id: int | None = None
    is_active: bool = True
