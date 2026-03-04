from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.warehouse_template_service import WarehouseTemplateService
from ..schemas.warehouse_template import WarehouseTemplatePayload

router = APIRouter(prefix="/warehouse", tags=["Warehouse Templates"])


@router.get("/templates")
def get_templates(
    tenant_id: int,
    db: Session = Depends(get_db),
):
    service = WarehouseTemplateService(db)
    return service.get_all(tenant_id)


@router.post("/templates")
def post_template(
    tenant_id: int,
    data: WarehouseTemplatePayload,
    db: Session = Depends(get_db),
):
    service = WarehouseTemplateService(db)
    payload = data.model_dump()
    return service.create(tenant_id, payload)


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: str,
    tenant_id: int,
    db: Session = Depends(get_db),
):
    service = WarehouseTemplateService(db)
    service.delete(tenant_id, template_id)
    return {"ok": True}
