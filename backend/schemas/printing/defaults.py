"""Default printer selection per tenant/warehouse."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class PrintingDefaultsRead(BaseModel):
    tenant_id: int
    warehouse_id: int | None = None
    a4_printer_id: int | None = None
    label_printer_id: int | None = None
    receipt_printer_id: int | None = None

    model_config = ConfigDict(from_attributes=True)


class PrintingDefaultsUpdate(BaseModel):
    warehouse_id: int | None = None
    a4_printer_id: int | None = Field(default=None, ge=1)
    label_printer_id: int | None = Field(default=None, ge=1)
    receipt_printer_id: int | None = Field(default=None, ge=1)


class PrinterAssignmentRepairRead(BaseModel):
    success: bool = True
    reason: str | None = None
    defaults_remapped: int = 0
    jobs_migrated: int = 0
    primary_agent_id: int | None = None
    primary_machine_id: str | None = None


class CloudPrintCapabilityRead(BaseModel):
    """Whether Sasist Agent print can accept a job for the assigned workstation."""

    kind: str
    ready: bool
    reason: str | None = None
    printer_id: int | None = None
    has_online_agent: bool = False
    workstation_id: int | None = None
    message: str | None = None
