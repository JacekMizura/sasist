from pydantic import BaseModel


class PrinterProfileNested(BaseModel):
    id: int
    name: str
    offset_x_mm: float
    offset_y_mm: float
    scale: float
    dpi: int | None = None


class PrinterPayload(BaseModel):
    name: str
    profile_id: int | None = None
    warehouse_id: int | None = None
    connection_type: str | None = None
    description: str | None = None
    provider: str | None = None
    system_printer_name: str | None = None


class PrinterResponse(BaseModel):
    id: int
    tenant_id: int
    name: str
    profile_id: int | None = None
    profile: PrinterProfileNested | None = None
    warehouse_id: int | None = None
    connection_type: str | None = None
    description: str | None = None
    provider: str | None = None
    system_printer_name: str | None = None
    created_at: str | None = None
    updated_at: str | None = None

    class Config:
        from_attributes = True
