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
