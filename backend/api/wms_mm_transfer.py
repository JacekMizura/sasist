"""WMS MM — internal stock transfer between locations (MOVE_OUT / MOVE_IN)."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user, get_optional_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..schemas.stock_document import StockDocumentRead
from ..schemas.wms_mm_transfer import (
    WmsMmCreateTransferBody,
    WmsMmDraftAppendBody,
    WmsMmLocationInventoryRow,
    WmsMmResolveLocationOut,
)
from ..schemas.wms_receiving import WmsReceivingPzListRow
from ..services.wms_mm_draft_service import (
    append_mm_draft_line,
    get_mm_draft_document_read,
    get_wms_mm_relocation_document_read,
    list_wms_mm_relocation_documents,
)
from ..services.wms_mm_transfer_service import (
    create_wms_mm_transfer,
    list_mm_location_inventory,
    resolve_mm_location_scan,
)
from ..services.wms_workforce_activity import MODULE_MOVEMENTS, log_wms_workforce_activity
from ..services.wms_audit_service import touch_wms_operation_session

router = APIRouter(prefix="/wms", tags=["WMS MM transfer"])


@router.get("/mm/resolve-location", response_model=WmsMmResolveLocationOut)
def get_wms_mm_resolve_location(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    code: str = Query(..., min_length=1, max_length=256),
    db: Session = Depends(get_db),
):
    try:
        return resolve_mm_location_scan(db, tenant_id, warehouse_id, code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/mm/location-inventory", response_model=List[WmsMmLocationInventoryRow])
def get_wms_mm_location_inventory(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    location_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return list_mm_location_inventory(db, tenant_id, warehouse_id, location_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/mm/transfer", response_model=StockDocumentRead)
def post_wms_mm_transfer(
    body: WmsMmCreateTransferBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    try:
        doc = create_wms_mm_transfer(
            db,
            tenant_id,
            body,
            performed_by=current_user,
            movement_type="MANUAL_MM",
        )
        log_wms_workforce_activity(
            db,
            user=current_user,
            tenant_id=tenant_id,
            module=MODULE_MOVEMENTS,
            action_type="scan_movement",
            entity_type="StockDocument",
            entity_id=doc.id,
            metadata={"movement_type": "MANUAL_MM"},
        )
        db.commit()
        return doc
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/mm/relocation", response_model=List[WmsReceivingPzListRow])
def get_wms_mm_relocation_list(
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """Draft PM/MM documents awaiting destination assignment (not PZ putaway queue)."""
    return list_wms_mm_relocation_documents(db, tenant_id)


@router.get("/mm/relocation/{document_id}", response_model=StockDocumentRead)
def get_wms_mm_relocation_document(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser | None = Depends(get_optional_current_user),
):
    try:
        doc = get_wms_mm_relocation_document_read(db, tenant_id, document_id)
        if current_user is not None and current_user.id is not None and getattr(doc, "warehouse_id", None) is not None:
            total = sum(float(getattr(it, "received_quantity", 0) or getattr(it, "ordered_quantity", 0) or 0) for it in doc.items or [])
            done = sum(float(getattr(it, "quantity_putaway", 0) or 0) for it in doc.items or [])
            touch_wms_operation_session(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(doc.warehouse_id),
                session_kind="mm_active",
                operator_user_id=int(current_user.id),
                metadata={
                    "screen": "mm_relocation_document",
                    "document_id": int(document_id),
                    "document": f"{doc.document_type}/{doc.id}",
                    "progress_done": done,
                    "progress_total": total,
                    "progress_percent": int(round((done / total) * 100)) if total > 0 else 0,
                },
            )
            db.commit()
        return doc
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/mm/draft", response_model=Optional[StockDocumentRead])
def get_wms_mm_draft(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return get_mm_draft_document_read(db, tenant_id, warehouse_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/mm/draft/lines", response_model=StockDocumentRead)
def post_wms_mm_draft_line(
    body: WmsMmDraftAppendBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return append_mm_draft_line(db, tenant_id, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
