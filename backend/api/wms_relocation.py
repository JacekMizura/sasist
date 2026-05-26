"""WMS relocation: close rozlokowanie workflow (no inventory changes)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..schemas.stock_document import StockDocumentRead
from ..services.wms_putaway_service import finalize_wms_relocation_pz
from ..services.wms_workforce_activity import MODULE_PUTAWAY, log_wms_workforce_activity

router = APIRouter(prefix="/wms", tags=["WMS relocation"])


@router.patch("/relocation/pz/{document_id}/finalize", response_model=StockDocumentRead)
def patch_finalize_wms_relocation_pz(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    """
    Sets relocation_status=DONE; if receiving is DONE, sets document status to zakonczone.
    Does not modify inventory (quantities were saved during putaway).
    """
    try:
        doc = finalize_wms_relocation_pz(db, tenant_id, document_id)
        log_wms_workforce_activity(
            db,
            user=user,
            tenant_id=tenant_id,
            module=MODULE_PUTAWAY,
            action_type="putaway_finish",
            entity_type="StockDocument",
            entity_id=document_id,
        )
        db.commit()
        return doc
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
