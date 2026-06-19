"""Panel administracyjny — pełna konfiguracja modułu zwrotów."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from pydantic import BaseModel

from ..database import get_db
from ..schemas.return_module_config import ReturnModuleConfigRead, ReturnModuleConfigWrite
from ..services.return_module_config_service import read_config_session, replace_config_session
from ..services.return_order_source_logo_upload import save_return_order_source_logo_bytes
from ..services.tenant_default_warehouse import ERR_NO_WAREHOUSE, resolve_tenant_default_warehouse_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/office/return-module", tags=["Office Return Module Config"])


def office_return_module_wh_dep(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
) -> int:
    if warehouse_id is not None:
        return warehouse_id
    try:
        return resolve_tenant_default_warehouse_id(db, tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=ERR_NO_WAREHOUSE) from None


@router.get("/config", response_model=ReturnModuleConfigRead)
def get_full_config(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(office_return_module_wh_dep),
    db: Session = Depends(get_db),
):
    try:
        out = read_config_session(db, tenant_id, warehouse_id)
        db.commit()
        return out
    except SQLAlchemyError:
        logger.exception("office_return_module get_full_config")
        db.rollback()
        raise HTTPException(status_code=500, detail="Błąd bazy danych") from None


@router.put("/config", response_model=ReturnModuleConfigRead)
def put_full_config(
    body: ReturnModuleConfigWrite,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(office_return_module_wh_dep),
    db: Session = Depends(get_db),
):
    try:
        result = replace_config_session(db, tenant_id, warehouse_id, body)
        db.commit()
        return result
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from None
    except SQLAlchemyError:
        logger.exception("office_return_module put_full_config")
        db.rollback()
        raise HTTPException(status_code=500, detail="Błąd bazy danych") from None


class ReturnOrderSourceLogoUploadRead(BaseModel):
    logo_url: str


@router.post("/order-sources/logo", response_model=ReturnOrderSourceLogoUploadRead)
async def upload_order_source_logo(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(office_return_module_wh_dep),
    file: UploadFile = File(...),
):
    del tenant_id, warehouse_id
    raw = await file.read()
    url = save_return_order_source_logo_bytes(raw, file.content_type or "image/png")
    return ReturnOrderSourceLogoUploadRead(logo_url=url)
