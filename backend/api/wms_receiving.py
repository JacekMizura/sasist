"""WMS: list draft PZ for counting; receive applies signed qty deltas (+ DOCK inventory by disposition)."""

from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user
from ..auth.warehouse_deps import (
    require_active_operable_warehouse,
    require_active_or_query_operable_warehouse,
    load_stock_document_for_active_warehouse,
    enforce_warehouse_access,
)
from ..database import get_db
from ..models.app_user import AppUser
from ..models.stock_document import StockDocument
from ..schemas.stock_document import PatchStockDocumentItemsBody, StockDocumentRead
from ..schemas.wms_receiving import (
    ReceivingPzCarriersAttachBody,
    ReceivingScanResolveOut,
    WmsCreateReceivingPzBody,
    WmsCreateReceivingProductBody,
    WmsEnsureProductLineBody,
    WmsEnsureProductLineResponse,
    WmsReceiveBody,
    WmsReceivingItemQuantityBody,
    WmsReceivingLineCommercialBody,
    WmsReceivingMarkDamagedBody,
    WmsReceivingMoveCarrierBody,
    WmsReceivingPzListRow,
    WmsReceivingPzSupplierBody,
    WmsReceivingSplitBody,
    WmsReceiveSerialBody,
)
from ..services.receiving_scan_service import resolve_receiving_scan
from ..services.document_creator_service import app_user_full_name
from ..services.wms_receiving_activity import (
    EVENT_PZ_DOCUMENT_CREATED,
    EVENT_PZ_RECEIVING_FINISHED,
    record_pz_activity,
)
from ..services.wms_receiving_line_commercial import (
    patch_wms_receiving_line_commercial,
    patch_wms_receiving_pz_supplier,
    remove_wms_receiving_extra_line,
)
from ..services.wms_receiving_service import (
    apply_wms_receive_deltas,
    create_product_from_wms_receiving,
    create_wms_empty_pz,
    ensure_wms_pz_product_anchor_line,
    finish_wms_receiving_pz,
    list_wms_receiving_pz_documents,
    mark_wms_receiving_pz_item_damaged,
    move_wms_receiving_pz_item_carrier,
    patch_wms_receiving_pz_item_quantity,
    post_receiving_pz_carriers,
    receive_wms_pz_serial,
    split_wms_receiving_pz_item_lines,
)
from ..services.wms_workforce_activity import MODULE_RECEIVING, log_wms_workforce_activity

router = APIRouter(prefix="/wms", tags=["WMS receiving"])
_logger = logging.getLogger(__name__)


def _load_pz_for_user(
    db: Session,
    tenant_id: int,
    pz_id: int,
    user: AppUser,
    *,
    active_warehouse_id: int,
) -> StockDocument:
    doc = load_stock_document_for_active_warehouse(
        db,
        user,
        tenant_id=tenant_id,
        document_id=pz_id,
        active_warehouse_id=active_warehouse_id,
    )
    if str(getattr(doc, "document_type", "") or "").strip().upper() != "PZ":
        raise HTTPException(status_code=404, detail="PZ not found")
    return doc


@router.get("/receiving/resolve-scan", response_model=ReceivingScanResolveOut)
def get_wms_receiving_resolve_scan(
    tenant_id: int = Query(..., ge=1),
    ean: str = Query(..., min_length=1, max_length=64),
    db: Session = Depends(get_db),
):
    """Map scanned EAN to product + default quantity (multipack row, carton, or retail EAN)."""
    return resolve_receiving_scan(db, tenant_id, ean)


@router.get("/receiving/pz", response_model=List[WmsReceivingPzListRow])
def get_wms_receiving_pz_list(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_operable_warehouse),
    db: Session = Depends(get_db),
):
    """Draft PZ where WMS receiving workflow is not DONE (Przyjęcie list) — active warehouse."""
    return list_wms_receiving_pz_documents(db, tenant_id, warehouse_id=warehouse_id)


@router.post("/receiving/pz", response_model=StockDocumentRead, status_code=201)
def post_wms_receiving_pz_create(
    body: WmsCreateReceivingPzBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    """WMS „Nowa dostawa”: pusta PZ (bez linii), dostawca po nazwie lub id."""
    try:
        wh = int(body.warehouse_id) if body.warehouse_id is not None else int(warehouse_id)
        enforce_warehouse_access(db, user, wh)
        doc = create_wms_empty_pz(db, tenant_id, body, created_by=user, warehouse_id=wh)
        supplier_label = (body.supplier_name or "").strip() or (f"#{doc.supplier_id}" if doc.supplier_id else "—")
        record_pz_activity(
            db,
            tenant_id=tenant_id,
            document_id=int(doc.id),
            warehouse_id=getattr(doc, "warehouse_id", None),
            event_code=EVENT_PZ_DOCUMENT_CREATED,
            description=f"Utworzono dokument PZ #{int(doc.id)}. Dostawca: {supplier_label}.",
            performed_by=user,
            metadata={
                "supplier_name": supplier_label,
                "supplier_id": doc.supplier_id,
            },
        )
        log_wms_workforce_activity(
            db,
            user=user,
            tenant_id=tenant_id,
            module=MODULE_RECEIVING,
            action_type="pz_start",
            entity_type="StockDocument",
            entity_id=doc.id,
            metadata={
                "supplier_name": body.supplier_name,
                "supplier_id": doc.supplier_id,
                "created_by": app_user_full_name(user),
            },
        )
        db.commit()
        return doc
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/receiving/pz/{pz_id}/create-product", response_model=StockDocumentRead, status_code=201)
def post_wms_receiving_pz_create_product(
    pz_id: int,
    body: WmsCreateReceivingProductBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    """Nowy produkt w asortymencie (minimalny) + linia na PZ."""
    _load_pz_for_user(db, tenant_id, pz_id, user, active_warehouse_id=warehouse_id)
    try:
        doc = create_product_from_wms_receiving(db, tenant_id, pz_id, body, performed_by=user)
        log_wms_workforce_activity(
            db,
            user=user,
            tenant_id=tenant_id,
            module=MODULE_RECEIVING,
            action_type="scan_product_create",
            entity_type="Product",
            entity_id=None,
            metadata={"ean": body.ean, "name": body.name, "pz_id": pz_id},
        )
        db.commit()
        return doc
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/receiving/pz/{pz_id}/ensure-product", response_model=WmsEnsureProductLineResponse)
def post_wms_receiving_pz_ensure_product(
    pz_id: int,
    body: WmsEnsureProductLineBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    """Produkt spoza PZ: linia EXTRA_ITEM (ordered=0), opcjonalnie auto +1 szt."""
    _load_pz_for_user(db, tenant_id, pz_id, user, active_warehouse_id=warehouse_id)
    try:
        doc, item_id, auto_received = ensure_wms_pz_product_anchor_line(
            db,
            tenant_id,
            pz_id,
            body.product_id,
            performed_by=user,
            line_source="WMS_SCAN",
        )
        log_wms_workforce_activity(
            db,
            user=user,
            tenant_id=tenant_id,
            module=MODULE_RECEIVING,
            action_type="scan_product_add",
            entity_type="StockDocument",
            entity_id=pz_id,
            metadata={"product_id": body.product_id, "item_id": item_id, "auto_received": auto_received},
        )
        db.commit()
        return WmsEnsureProductLineResponse(document=doc, item_id=item_id, auto_received=auto_received)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/receiving/pz/{pz_id}/finish", response_model=StockDocumentRead)
def post_wms_receiving_pz_finish(
    pz_id: int,
    body: PatchStockDocumentItemsBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    """Persist counted lines and set receiving_status = DONE (Zakończ przyjęcie)."""
    _logger.info(
        "[RECEIVING_FINISH] endpoint POST document_id=%s tenant_id=%s user_id=%s patch_items=%s",
        pz_id,
        tenant_id,
        user.id,
        len(body.items),
    )
    doc_pre = _load_pz_for_user(db, tenant_id, pz_id, user, active_warehouse_id=warehouse_id)
    _logger.info(
        "[RECEIVING_FINISH] document_id=%s tenant_id=%s warehouse_id=%s status=%s document_type=%s",
        pz_id,
        tenant_id,
        getattr(doc_pre, "warehouse_id", None),
        getattr(doc_pre, "status", None),
        getattr(doc_pre, "document_type", None),
    )
    try:
        doc = finish_wms_receiving_pz(db, tenant_id, pz_id, body)
        record_pz_activity(
            db,
            tenant_id=tenant_id,
            document_id=int(pz_id),
            warehouse_id=getattr(doc, "warehouse_id", None),
            event_code=EVENT_PZ_RECEIVING_FINISHED,
            description=f"Zakończono przyjęcie dokumentu PZ #{int(pz_id)}.",
            performed_by=user,
            metadata={"pz_id": int(pz_id)},
        )
        log_wms_workforce_activity(
            db,
            user=user,
            tenant_id=tenant_id,
            module=MODULE_RECEIVING,
            action_type="pz_finish",
            entity_type="StockDocument",
            entity_id=pz_id,
        )
        db.commit()
        return doc
    except ValueError as e:
        detail = str(e)
        _logger.warning(
            "[RECEIVING_FINISH] HTTP 400 document_id=%s tenant_id=%s detail=%s",
            pz_id,
            tenant_id,
            detail,
        )
        raise HTTPException(status_code=400, detail=detail)


@router.post("/receive", response_model=StockDocumentRead)
def post_wms_receive(
    body: WmsReceiveBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_operable_warehouse),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    load_stock_document_for_active_warehouse(
        db,
        current_user,
        tenant_id=tenant_id,
        document_id=int(body.pz_id),
        active_warehouse_id=warehouse_id,
    )
    try:
        doc = apply_wms_receive_deltas(db, tenant_id, body, performed_by=current_user)
        log_wms_workforce_activity(
            db,
            user=current_user,
            tenant_id=tenant_id,
            module=MODULE_RECEIVING,
            action_type="scan_product",
            entity_type="StockDocument",
            entity_id=body.pz_id,
            metadata={"lines": len(body.lines or [])},
        )
        db.commit()
        return doc
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/receiving/pz/{pz_id}/carriers", response_model=StockDocumentRead)
def post_wms_receiving_pz_carriers(
    pz_id: int,
    body: ReceivingPzCarriersAttachBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    """Przypisz istniejący nośnik do PZ lub utwórz serię (bulk) i przypisz wszystkie."""
    _load_pz_for_user(db, tenant_id, pz_id, user, active_warehouse_id=warehouse_id)
    try:
        doc = post_receiving_pz_carriers(db, tenant_id, pz_id, body, performed_by=user)
        act = "scan_carrier_activate" if body.warehouse_carrier_id else "scan_carrier_create"
        log_wms_workforce_activity(
            db,
            user=user,
            tenant_id=tenant_id,
            module=MODULE_RECEIVING,
            action_type=act,
            entity_type="StockDocument",
            entity_id=pz_id,
            metadata={
                "warehouse_carrier_id": body.warehouse_carrier_id,
                "bulk_create": body.bulk_create is not None,
            },
        )
        db.commit()
        return doc
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/receiving/pz/{pz_id}/receive-serial", response_model=StockDocumentRead)
def post_wms_receiving_pz_receive_serial(
    pz_id: int,
    body: WmsReceiveSerialBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    """Przyjęcie 1 szt. po numerze seryjnym (track_serial)."""
    _load_pz_for_user(db, tenant_id, pz_id, user, active_warehouse_id=warehouse_id)
    try:
        doc = receive_wms_pz_serial(db, tenant_id, pz_id, body, performed_by=user)
        log_wms_workforce_activity(
            db,
            user=user,
            tenant_id=tenant_id,
            module=MODULE_RECEIVING,
            action_type="scan_serial",
            entity_type="StockDocument",
            entity_id=pz_id,
            metadata={"product_id": body.product_id, "serial_number": body.serial_number},
        )
        db.commit()
        return doc
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.patch("/receiving/pz/{pz_id}/items/{item_id}", response_model=StockDocumentRead)
def patch_wms_receiving_pz_item(
    pz_id: int,
    item_id: int,
    body: WmsReceivingItemQuantityBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    """Signed qty delta on a lot row (or new row); updates DOCK inventory; rejects below putaway floor."""
    _load_pz_for_user(db, tenant_id, pz_id, user, active_warehouse_id=warehouse_id)
    try:
        doc = patch_wms_receiving_pz_item_quantity(db, tenant_id, pz_id, item_id, body, performed_by=user)
        log_wms_workforce_activity(
            db,
            user=user,
            tenant_id=tenant_id,
            module=MODULE_RECEIVING,
            action_type="scan_product",
            entity_type="StockDocumentItem",
            entity_id=item_id,
            metadata={
                "pz_id": pz_id,
                "quantity_received": body.quantity_received,
                "warehouse_carrier_id": body.warehouse_carrier_id,
            },
        )
        db.commit()
        return doc
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/receiving/pz/{pz_id}/items/{item_id}/commercial", response_model=StockDocumentRead)
def patch_wms_receiving_pz_item_commercial(
    pz_id: int,
    item_id: int,
    body: WmsReceivingLineCommercialBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    """Ręczna zmiana ilości z dokumentu / ceny netto / VAT (snapshot na linii)."""
    _load_pz_for_user(db, tenant_id, pz_id, user, active_warehouse_id=warehouse_id)
    try:
        return patch_wms_receiving_line_commercial(
            db, tenant_id, pz_id, item_id, body, performed_by=user
        )
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.patch("/receiving/pz/{pz_id}/supplier", response_model=StockDocumentRead)
def patch_wms_receiving_pz_supplier_route(
    pz_id: int,
    body: WmsReceivingPzSupplierBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _load_pz_for_user(db, tenant_id, pz_id, user, active_warehouse_id=warehouse_id)
    try:
        return patch_wms_receiving_pz_supplier(
            db, tenant_id, pz_id, supplier_id=body.supplier_id, performed_by=user
        )
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.delete("/receiving/pz/{pz_id}/items/{item_id}", response_model=StockDocumentRead)
def delete_wms_receiving_pz_item(
    pz_id: int,
    item_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    """Usuń pozycję EXTRA: received=0 od razu; received>0 i putaway=0 — wycofaj DOCK + usuń."""
    _load_pz_for_user(db, tenant_id, pz_id, user, active_warehouse_id=warehouse_id)
    try:
        return remove_wms_receiving_extra_line(db, tenant_id, pz_id, item_id, performed_by=user)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/receiving/pz/{pz_id}/items/{item_id}/mark-damaged", response_model=StockDocumentRead)
def post_wms_receiving_pz_item_mark_damaged(
    pz_id: int,
    item_id: int,
    body: WmsReceivingMarkDamagedBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    """Transfer saleable received qty into a damaged (REJECTED_STOCK) bucket line on the draft PZ."""
    _load_pz_for_user(db, tenant_id, pz_id, user, active_warehouse_id=warehouse_id)
    try:
        doc = mark_wms_receiving_pz_item_damaged(db, tenant_id, pz_id, item_id, body, performed_by=user)
        log_wms_workforce_activity(
            db,
            user=user,
            tenant_id=tenant_id,
            module=MODULE_RECEIVING,
            action_type="mark_damaged",
            entity_type="StockDocumentItem",
            entity_id=item_id,
            metadata={"pz_id": pz_id, "quantity": body.quantity},
        )
        db.commit()
        return doc
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/receiving/pz/{pz_id}/items/{item_id}/move-carrier", response_model=StockDocumentRead)
def post_wms_receiving_pz_item_move_carrier(
    pz_id: int,
    item_id: int,
    body: WmsReceivingMoveCarrierBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    """Move all received qty on a line from its current carrier to another (or luzem)."""
    _load_pz_for_user(db, tenant_id, pz_id, user, active_warehouse_id=warehouse_id)
    try:
        doc = move_wms_receiving_pz_item_carrier(db, tenant_id, pz_id, item_id, body, performed_by=user)
        log_wms_workforce_activity(
            db,
            user=user,
            tenant_id=tenant_id,
            module=MODULE_RECEIVING,
            action_type="move_carrier",
            entity_type="StockDocumentItem",
            entity_id=item_id,
            metadata={"pz_id": pz_id, "warehouse_carrier_id": body.warehouse_carrier_id},
        )
        db.commit()
        return doc
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.put("/receiving/pz/{pz_id}/items/{item_id}/split", response_model=StockDocumentRead)
def put_wms_receiving_pz_item_split(
    pz_id: int,
    item_id: int,
    body: WmsReceivingSplitBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_operable_warehouse),
    db: Session = Depends(get_db),
    _user: AppUser = Depends(get_current_user),
):
    """Replace line group (same delivery line) with multiple batch/expiry segments."""
    _load_pz_for_user(db, tenant_id, pz_id, _user, active_warehouse_id=warehouse_id)
    try:
        return split_wms_receiving_pz_item_lines(db, tenant_id, pz_id, item_id, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
