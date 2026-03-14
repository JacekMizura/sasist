from pydantic import BaseModel


class PrinterProfilePayload(BaseModel):
    name: str
    dpi: int | None = None
    offset_x_mm: float = 0.0
    offset_y_mm: float = 0.0
    scale: float = 1.0


class PrinterProfileResponse(BaseModel):
    id: int
    tenant_id: int
    name: str
    dpi: int | None = None
    offset_x_mm: float
    offset_y_mm: float
    scale: float
    created_at: str | None = None
    updated_at: str | None = None

    class Config:
        from_attributes = True
