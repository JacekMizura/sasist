"""WMS — skrócona konfiguracja zwrotów (widoczne wpisy)."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.return_module_config import WmsReturnModuleConfigRead
from ..services.return_module_config_service import read_wms_bundle_session
from ..services.tenant_default_warehouse import resolve_tenant_default_warehouse_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/wms/return-module", tags=["WMS Return Module Config"])


def wms_return_module_wh_dep(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
) -> int:
    if warehouse_id is not None:
        return warehouse_id
    try:
        return resolve_tenant_default_warehouse_id(db, tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Brak skonfigurowanego magazynu") from None


@router.get("/config", response_model=WmsReturnModuleConfigRead)
def wms_return_module_config(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(wms_return_module_wh_dep),
    db: Session = Depends(get_db),
):
    try:
        out = read_wms_bundle_session(db, tenant_id, warehouse_id)
        db.commit()
        return out
    except SQLAlchemyError:
        logger.exception("wms_return_module_config")
        db.rollback()
        raise HTTPException(status_code=500, detail="Błąd bazy danych") from None
