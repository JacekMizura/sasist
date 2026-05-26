"""WMS putaway: assign received PZ lines to storage locations."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user, get_optional_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..models.warehouse import Warehouse
from ..schemas.wms_putaway import (
    WmsPutawayCarrierBulkBody,
    WmsPutawayCarrierBulkOut,
    WmsPutawayPatchBody,
    WmsPutawayPatchOut,
    WmsPutawayLocationSuggestionsOut,
    WmsPutawaySuggestLocationOut,
    WmsTenantContextOut,
)
from ..schemas.stock_document import StockDocumentRead
from ..schemas.wms_receiving import WmsReceivingPzListRow
from ..services.stock_document_service import get_stock_document_read
from ..services.tenant_default_warehouse import resolve_tenant_default_warehouse_id
from ..services.wms_putaway_service import (
    list_wms_putaway_pz_documents,
    patch_wms_putaway_carrier_bulk,
    patch_wms_putaway_item,
    suggest_putaway_location,
    suggest_putaway_locations,
)
from ..services.wms_workforce_activity import MODULE_PUTAWAY, log_wms_workforce_activity
from ..services.wms_audit_service import touch_wms_operation_session

router = APIRouter(prefix="/wms", tags=["WMS putaway"])


@router.get("/context", response_model=WmsTenantContextOut)
def get_wms_tenant_context(
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        wh_id = resolve_tenant_default_warehouse_id(db, tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Brak skonfigurowanego magazynu")
    wh = db.query(Warehouse).filter(Warehouse.id == wh_id).first()
    return WmsTenantContextOut(
        warehouse_id=wh_id,
        warehouse_name=(wh.name or "").strip() if wh else "",
    )


@router.get("/putaway/pz", response_model=List[WmsReceivingPzListRow])
def get_wms_putaway_pz_list(
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """PZ with received stock (live during przyjęcie) and relocation OPEN — Rozlokowanie list."""
    return list_wms_putaway_pz_documents(db, tenant_id)


@router.get("/putaway/pz/{document_id}", response_model=StockDocumentRead)
def get_wms_putaway_pz_document(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser | None = Depends(get_optional_current_user),
):
    """Single PZ for rozlokowanie — items with received_quantity > 0 only."""
    doc = get_stock_document_read(db, tenant_id, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Dokument nie znaleziony")
    if str(getattr(doc, "document_type", None) or "").strip().upper() == "MM":
        raise HTTPException(
            status_code=404,
            detail="Dokument przesunięcia magazynowego (PM/MM) — użyj modułu przesunięć",
        )
    eps = 1e-5
    all_items = list(doc.items or [])
    t_ord = sum(float(it.ordered_quantity or 0) for it in all_items)
    t_rec = sum(float(it.received_quantity or 0) for it in all_items)
    t_put = sum(float(it.quantity_putaway or 0) for it in all_items)
    doc.total_ordered = t_ord
    doc.total_received = t_rec
    rs = str(getattr(doc, "receiving_status", None) or "NEW").strip().upper()
    doc.putaway_target_quantity = t_rec if rs != "DONE" else t_ord
    doc.total_putaway = t_put
    received_lines = [it for it in all_items if float(it.received_quantity or 0) > eps]
    if not received_lines:
        raise HTTPException(status_code=404, detail="Brak przyjętych pozycji do rozlokowania")
    doc.items = received_lines
    if current_user is not None and current_user.id is not None and getattr(doc, "warehouse_id", None) is not None:
        touch_wms_operation_session(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(doc.warehouse_id),
            session_kind="putaway_active",
            operator_user_id=int(current_user.id),
            metadata={
                "screen": "putaway_document",
                "document_id": int(document_id),
                "document": f"{doc.document_type}/{doc.id}",
                "progress_done": float(t_put),
                "progress_total": float(doc.putaway_target_quantity or 0),
                "progress_percent": int(round((t_put / float(doc.putaway_target_quantity or 0)) * 100))
                if float(doc.putaway_target_quantity or 0) > 0
                else 0,
            },
        )
        db.commit()
    return doc


@router.get("/putaway/items/{item_id}/suggest-location", response_model=WmsPutawaySuggestLocationOut)
def get_wms_putaway_suggest_location(
    item_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return suggest_putaway_location(db, tenant_id, item_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/putaway/items/{item_id}/location-suggestions", response_model=WmsPutawayLocationSuggestionsOut)
def get_wms_putaway_location_suggestions(
    item_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return suggest_putaway_locations(db, tenant_id, item_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/putaway/carrier-bulk", response_model=WmsPutawayCarrierBulkOut)
def patch_wms_putaway_carrier(
    body: WmsPutawayCarrierBulkBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    try:
        out = patch_wms_putaway_carrier_bulk(db, tenant_id, body, performed_by=current_user)
        log_wms_workforce_activity(
            db,
            user=current_user,
            tenant_id=tenant_id,
            module=MODULE_PUTAWAY,
            action_type="scan_carrier_putaway",
            entity_type="StockDocument",
            entity_id=body.document_id,
            metadata={
                "warehouse_carrier_id": body.warehouse_carrier_id,
                "location_id": body.location_id,
                "lines_putaway": out.lines_putaway,
                "total_quantity": out.total_quantity,
            },
        )
        db.commit()
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/putaway/{item_id}", response_model=WmsPutawayPatchOut)
def patch_wms_putaway(
    item_id: int,
    body: WmsPutawayPatchBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    try:
        out = patch_wms_putaway_item(db, tenant_id, item_id, body, performed_by=current_user)
        log_wms_workforce_activity(
            db,
            user=current_user,
            tenant_id=tenant_id,
            module=MODULE_PUTAWAY,
            action_type="scan_product_putaway",
            entity_type="StockDocumentItem",
            entity_id=item_id,
            metadata={
                "location_id": body.location_id,
                "quantity": body.quantity,
                "warehouse_carrier_id": body.warehouse_carrier_id,
            },
        )
        db.commit()
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
