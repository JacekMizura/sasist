from pydantic import BaseModel


class StructureReportPdfRequest(BaseModel):
    """Request for frontend-rendered warehouse structure PDF."""

    warehouse_id: int
    layout_id: int
    tenant_id: int = 1


class ProductLocationReportPdfRequest(BaseModel):
    """Request for frontend-rendered product location PDF."""

    warehouse_id: int
    layout_id: int
    tenant_id: int = 1
