"""WMS relocation: ZWK batch document, sesja operatora, finalize PZ."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..services.relocation_document_series_service import RELOCATION_DOCUMENT_SERIES_MISSING_MSG

from ..auth.deps import get_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..schemas.stock_document import StockDocumentRead
from ..schemas.wms_relocation_batch import (
    WmsRelocationAddItemsBody,
    WmsRelocationAddItemsOut,
    WmsRelocationBatchContextOut,
    WmsRelocationStartSessionBody,
    WmsRelocationStartSessionOut,
)
from ..services.wms_putaway_service import finalize_wms_relocation_pz
from ..services.wms_relocation_batch_service import (
    add_relocation_items_to_document,
    get_relocation_batch_context,
    start_relocation_session,
)
from ..services.wms_workforce_activity import MODULE_PUTAWAY, log_wms_workforce_activity

router = APIRouter(prefix="/wms", tags=["WMS relocation"])
logger = logging.getLogger(__name__)


def _relocation_error_detail(exc: Exception) -> dict[str, str]:
    if isinstance(exc, ValueError):
        msg = str(exc).strip()
        if msg:
            return {"message": msg}
    raw = str(exc).lower()
    if any(
        token in raw
        for token in (
            "series",
            "document_series",
            "foreign key",
            "integrity",
            "not null",
            "supplier",
            "delivery",
        )
    ):
        return {"message": RELOCATION_DOCUMENT_SERIES_MISSING_MSG}
    return {"message": "Nie udało się przygotować dokumentu rozlokowania."}


def _raise_relocation_http_error(exc: Exception) -> None:
    raise HTTPException(status_code=400, detail=_relocation_error_detail(exc))


@router.get("/relocation/batch-context", response_model=WmsRelocationBatchContextOut)
def get_wms_relocation_batch_context(
    order_id: int = Query(..., ge=1),
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _user: AppUser = Depends(get_current_user),
):
    try:
        ctx = get_relocation_batch_context(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=int(order_id),
        )
        return WmsRelocationBatchContextOut(**ctx)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=_relocation_error_detail(e))
    except SQLAlchemyError as e:
        logger.exception("[wms.relocation.batch-context] db error")
        _raise_relocation_http_error(e)
    except Exception as e:
        logger.exception("[wms.relocation.batch-context] unexpected")
        _raise_relocation_http_error(e)


@router.post("/relocation/add-items", response_model=WmsRelocationAddItemsOut)
def post_wms_relocation_add_items(
    body: WmsRelocationAddItemsBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    try:
        out = add_relocation_items_to_document(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=int(body.order_id),
            order_item_ids=body.order_item_ids,
            operator_user_id=int(user.id),
        )
        db.commit()
        return WmsRelocationAddItemsOut(**out)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=_relocation_error_detail(e))
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("[wms.relocation.add-items] db error")
        _raise_relocation_http_error(e)
    except Exception as e:
        db.rollback()
        logger.exception("[wms.relocation.add-items] unexpected")
        _raise_relocation_http_error(e)


@router.post("/relocation/start-session", response_model=WmsRelocationStartSessionOut)
def post_wms_relocation_start_session(
    body: WmsRelocationStartSessionBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    try:
        out = start_relocation_session(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            operator_user_id=int(user.id),
            operator_name=str(user.display_name or user.username or user.email or "operator"),
            order_id=body.order_id,
            task_id=body.task_id,
            takeover=bool(body.takeover),
        )
        db.commit()
        return WmsRelocationStartSessionOut(**out)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=_relocation_error_detail(e))
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("[wms.relocation.start-session] db error")
        _raise_relocation_http_error(e)
    except Exception as e:
        db.rollback()
        logger.exception("[wms.relocation.start-session] unexpected")
        _raise_relocation_http_error(e)


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
